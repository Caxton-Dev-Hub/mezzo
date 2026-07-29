# Browser end-to-end tests

Playwright specs for the flows the frontend milestones call out: the escrow
creation wizard (F2), invite acceptance (F3), and funding (F4). They drive a
real browser against a real API and a real database — nothing is mocked except
the camera (a file is supplied to the capture input) and the Paystack checkout
page itself.

```
pnpm --filter @mezzo/web test:e2e
```

## The stack is self-contained

`global-setup.ts` builds the whole environment and tears it down afterwards, so
the suite never touches your dev servers, your `.next` build, or a database you
care about:

- Postgres, Redis and MinIO come up as throwaway Testcontainers on random
  ports, and migrations run against the fresh database.
- The API is built and started on port **4000**, the web app on port **4001** —
  deliberately not 3000/3001, so a running `pnpm dev` is left alone.
- The web app compiles into `.next-e2e` (via `NEXT_DIST_DIR`), not `.next`.

Because the ports are fixed, only one e2e run can be in flight at a time.

## Why `next dev` rather than a production build

A production `next build` peaks north of a gigabyte. On a developer machine
already running the app stack, an editor and a browser that is enough to get
the build OOM-killed, which surfaces as an empty, confusing failure. `next dev`
compiles each route on first request instead, with a far smaller footprint —
hence the generous navigation timeouts in `playwright.config.ts`.

## Funding is asserted the way the product promises it

`funding.e2e-spec.ts` is the important one. It stubs the Paystack checkout page
with `page.route`, lets the browser complete the redirect, and then asserts the
escrow is **still not funded** — the UI shows "Confirming payment…". Only after
the spec posts an HMAC-signed `charge.success` webhook to the API does it
expect `FUNDED`. A client-side success callback never moves money, and this
test fails if that ever stops being true.

## Test users

`helpers.ts` registers users through the API and lifts them to `TIER_1` the
same way production does — submit a KYC verification, then deliver the
provider's approval webhook. There is no back door that writes the tier
directly, so the tests exercise the real gate.
