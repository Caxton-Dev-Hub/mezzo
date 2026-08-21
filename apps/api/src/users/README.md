# Users module

Owns the `User` entity's identity and account-state columns — **but not the
columns other modules mutate on it.** `role`, `status`, and `email` are this
module's to write; `kycTier` is written directly by `kyc` and read everywhere
else, because ownership of an entity's row and ownership of every column on
it are not the same thing here.

## Two controllers, two audiences

`UsersController` (`/users`) and `ProfileController` (`/profiles`) both sit
on top of the same `User` row, but they answer to different callers and nest
into different domain spaces, which is why they were never merged into one:

- **`UsersController`** is the identity surface: `GET /users/me` (who am I,
  what role) and `GET /users` (admin-only, the raw list). Its DTO
  (`UserResponse`) exposes `role` and `emailVerified` — account facts, not
  personal ones.
- **`ProfileController`** is the profile surface: `GET/PATCH /profiles/me`,
  the avatar presign/confirm pair, and `GET /profiles/:id` for viewing
  *someone else's* public profile (the counterparty in an escrow, a seller
  before agreeing to terms). `PublicProfileResponse` deliberately excludes
  `email` and `role` — `ProfileResponse` (the "me" shape) adds them back.

The admin-facing bulk operations — search, `updateRole`, `updateStatus` —
live only in `UsersService` and are called from `admin/admin.service.ts`,
never routed through `UsersController` itself. There's no `/users/:id`
PATCH here; role/status changes are an admin-module concern with its own
audit trail, and `users` just exposes the primitives (`updateRole`,
`updateStatus`, `search`, `findEmailsByIds`) for that module to call.

## Why `ProfileController` and `ProfileService` disappear without a database

`UsersModule` computes `profilesEnabled = isDatabaseConfigured()` at import
time and conditionally omits `ProfileController`, `ProfileService`, and
`StorageModule` from the module's `controllers`/`providers`/`imports`
arrays entirely — not a guard inside the service, an absent provider.
`UsersService` still registers because `UsersController` (`/users/me`,
auth's own path to a logged-in user) has to work in the JSON-store fallback
mode this codebase uses when `DATABASE_URL` is unset. Profiles depend on
`EscrowParty` (for `completedEscrows`) and object storage for avatars — both
real-database concerns with no JSON-store equivalent — so rather than teach
`ProfileService` to degrade, the module just doesn't wire it up when there's
no database to back it.

## Avatar upload: the same presign/confirm shape as evidence

`presignAvatar` → client `PUT`s directly to storage → `confirmAvatar` mirrors
the evidence module's upload pattern (see `evidence/README.md`) rather than
inventing a second one: the API never proxies the bytes, and `confirmAvatar`
reaches back into storage to fetch what was actually uploaded before trusting
it.

- **The storage key is namespaced and checked, not just generated.**
  `presignAvatar` mints `avatars/{userId}/{uuid}`; `confirmAvatar` rejects
  any key that doesn't start with `avatars/{userId}/` (`InvalidAvatarKeyError`)
  before ever touching storage — a stolen or guessed key for someone else's
  presigned slot can't be confirmed onto your own profile.
- **Declared mime is checked against sniffed bytes, not trusted.**
  `confirmAvatar` runs `file-type`'s `fromBuffer` over the downloaded object
  and compares it to the client's `declaredMime`; a mismatch (or a file over
  `MAX_AVATAR_BYTES`, 5 MiB) deletes the orphaned object and throws
  `AvatarMimeMismatchError` — the same "sniff, don't trust the label" rule
  evidence enforces on product photos, applied here to avatars.
- **The old avatar is deleted only after the new one is committed.** The
  previous `avatarKey` is read before the row is overwritten, and the delete
  happens after `save()` — so a crash between confirming the new avatar and
  cleaning up the old one leaves an orphaned object in storage, never a user
  with no avatar at all.

## `kycTier` lives here but is never written here

`User.kycTier` is a column on this module's entity, but `kyc.module.ts`
injects its own `Repository<User>` via `TypeOrmModule.forFeature([User, ...])`
and writes `user.kycTier` directly (`kyc.service.ts`, on submission and on
provider callback) rather than going through `UsersService`. `UsersService`
has no `updateKycTier` method at all. This means the tier check that gates
payments (`payments/README.md`'s KYC cap) and the role check that gates
admin routes are enforced completely differently even though both live on
the same row: role changes are mediated through `UsersService.updateRole`
(admin-audited), tier changes are written straight to the entity by whichever
module owns the verification event that earned the tier.

## Bootstrap admins and Google linking share one rule

Both `create()` (password signup) and `linkOrCreateGoogleUser()` (OAuth)
check the same `BOOTSTRAP_ADMIN_EMAILS` set — parsed once in the
constructor, lower-cased, trimmed — and grant `UserRole.ADMIN` at creation
time if the normalizing email matches. There is no other way to mint an
admin: no endpoint promotes a user to `ADMIN` after the fact from inside
this module (only `admin`'s own role-change surface can, post-signup). A
Google sign-in with no existing account and an email that isn't linked by
`googleSub` falls back to matching by normalized email — so a user who
registered with a password and later signs in with Google on the same
address gets `googleSub` attached to their existing row instead of a
duplicate account, and their `emailVerifiedAt` is backfilled if it was
still null (Google already verified the address).

## Key pieces

- **`UsersService`** — the only writer of `role`/`status`/`email`/
  `googleSub`. `create`, `linkOrCreateGoogleUser`, `findByEmail`, `findById`
  / `getById` (throwing variant), `findAll`, `search` (paginated, filtered
  by role/status/kycTier/email substring), `updateRole`, `updateStatus`,
  `findEmailsByIds` (bulk lookup for `admin`'s response hydration).
- **`ProfileService`** — `getOwnProfile`, `getPublicProfile` (same
  projection logic, different DTO), `update` (business name/bio/location
  only — nothing identity- or security-bearing), `presignAvatar`,
  `confirmAvatar`. `countCompletedEscrows` queries `EscrowParty` joined to
  `Escrow` filtered on `RELEASED`, so it counts settlement outcomes, not
  escrow membership.
- **`dto/user-response.ts`** / **`dto/profile-response.ts`** — the mapping
  functions (`toUserResponse`, `toProfileResponse`, `toPublicProfileResponse`)
  are the only places a `User` row's shape is allowed to leak into an HTTP
  response; nothing else on this module hands out a raw entity.

## Invariants

- **Email is unique and always normalized to lowercase** before any lookup
  or write — `create`, `linkOrCreateGoogleUser`, and `findByEmail` all
  lower-case before touching the repository, so `Buyer@Example.com` and
  `buyer@example.com` are never two different accounts.
- **`googleSub` is looked up before email**, in `linkOrCreateGoogleUser`, so
  a returning Google user whose email address changed at the provider still
  resolves to their existing row rather than creating a second one.
- **A confirmed avatar key always belongs to the confirming user.** Enforced
  by the `avatars/{userId}/` prefix check, not by trusting that only the
  owner would ever have received the presigned URL.
- **`ProfileController` never exists without a database.** There's no
  partial-profile mode — either the full profile stack is wired in, or none
  of it is, so there's no code path that has to reason about a profile
  service running against a store that can't support `EscrowParty` joins.
