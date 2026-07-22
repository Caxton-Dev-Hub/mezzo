# Chat module

The in-escrow negotiation channel. Everything a buyer and seller say to
each other about an order happens here rather than off-platform, so the
transcript is complete enough to be admissible evidence when a dispute
reaches Milestone 9's AI arbiter — `DisputeService.getPacket()` (Milestone
8) now pulls the transcript straight out of this module instead of the
`chatTranscript: []` placeholder it shipped with.

## Access: party, or arbiter-once-disputed

`ChatService.assertCanAccess()` is the single authorization choke point,
called at the top of every mutating and reading method (`send`, `list`) —
the same "checked in the service, not `@Roles()`" shape Milestone 8's
`DisputeService.getPacket()` established, because a plain `USER` who
happens to be a party legitimately needs access too:

```
isParty(escrowId, userId)                                  -> allow
role in {ARBITER, ADMIN} AND escrow was ever DISPUTED        -> allow
otherwise                                                     -> NotEscrowPartyError (403)
```

"Was ever `DISPUTED`" is `EscrowService.hasEverBeenDisputed()` — a count
against `escrow_events` for a row with `toState = DISPUTED` — rather than
"is `DISPUTED` right now", so an arbiter who opened the chat mid-review
doesn't lose access the moment the dispute resolves and the escrow moves
on to `RELEASED`/`REFUNDED`. This lives on `EscrowService` rather than
`DisputeService` specifically to avoid a `ChatModule` <-> `DisputeModule`
circular import: `ChatModule` only depends on `EscrowModule`, and
`DisputeModule` depends on `ChatModule` (for the transcript), never the
reverse.

## Messages are append-only

There is no `PATCH`/`DELETE` route anywhere in `ChatController` — not a
guard that blocks them, an absence of them. A message is a single `save()`
of a new row; nothing in the module ever calls `update()` or `delete()`
against `chat_messages`.

## Attachments route through the evidence module

A chat attachment is not a separate upload pipeline — it is an
`EvidenceItem` the client already presigned and confirmed through the
existing `evidence` module endpoints (Milestone 4), tagged
`EvidencePhase.CHAT` (a third phase alongside `AT_CREATION`/
`AT_DELIVERY`, added this milestone). That gets the SHA-256 hash, EXIF
extraction, and integrity flags for free — `ChatService.send()` only
re-validates that the referenced `EvidenceItem.escrowId` matches the
chat's escrow (`EvidenceAttachmentNotFoundError` otherwise, so one
escrow's evidence can't be pinned into another's chat) and folds it into
the response via the same `toEvidenceItemResponse` mapper the evidence
bundle uses. `DisputeService.getPacket()` never mixes `CHAT`-phase items
into `creationEvidence`/`buyerEvidence`/`sellerEvidence` (those still
filter strictly on `AT_CREATION`/`AT_DELIVERY`) — a chat attachment
surfaces to the arbiter through the transcript, not the evidence bundle
buckets.

## Realtime: a JWT-authenticated, per-escrow Socket.IO namespace

`ChatGateway` is this codebase's first WebSocket surface
(`@nestjs/websockets` + `@nestjs/platform-socket.io`, namespace
`/ws/chat`). It deliberately does not reuse `JwtAuthGuard` — HTTP guards
run against an `ExecutionContext` backed by an Express `Request`, and a
socket handshake has neither — but verifies the same access token with
the same `JwtService`/`JWT_ACCESS_SECRET`, then delegates room admission
to `ChatService.assertCanAccess()`:

```
handleConnection(client):
  token, escrowId  <- client.handshake.auth (fallback: query string)
  missing either   -> disconnect
  verify token      -> AuthenticatedUser
  assertCanAccess(escrowId, user)  -> throws for a non-party/non-arbiter
  join room `escrow:{escrowId}`
```

Any failure — missing token, invalid token, wrong escrow, a stranger —
ends the same way: `client.disconnect(true)`. A connected client emits
`message:send`; the gateway re-validates through `ChatService.send()`
(never trusting the connection-time check alone for a mutation) and
broadcasts `message:new` to the room, so both parties' screens update
without polling.

## Key pieces

- **`ChatService`** — `assertCanAccess`, `send`, `list`, and
  `getTranscript` (the unguarded variant `DisputeService.getPacket()`
  calls internally, since packet access is already gated at that call
  site).
- **`ChatController`** — `GET`/`POST /escrows/:escrowId/chat`.
- **`ChatGateway`** — the `/ws/chat` namespace, JWT + per-escrow
  authorization on connect, `message:send` in / `message:new` out.
- **`database/entities/chat-message.entity.ts`** — append-only,
  optionally pointing at an `EvidenceItem` via
  `attachmentEvidenceItemId`.
