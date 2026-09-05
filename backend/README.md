# Backend (NestJS API)

Modular-monolith backend for the used-car-parts marketplace platform —
architecture matches section 7.1-7.2 of the technical review in
`../docs/project-brief.md`.

## Status

**Verified against a real database and a running server** (2026-09-05).
A Postgres instance was started, `prisma migrate deploy` applied the
committed migration, `npm run prisma:seed` loaded the catalog, and the
whole product loop was exercised over HTTP:

- customer posts a request → it appears in the verified dealer's inbox →
  dealer answers → a conversation opens → both sides exchange messages →
  customer closes the request → a later answer is refused
- answering twice returns the same conversation (idempotent)
- notification rows are created for both sides by the event fan-out
- an unverified dealer is refused both the inbox and answering (403)
- a non-participant is refused reading and writing a thread, and reading
  or closing someone else's request (403)
- a non-admin is refused the admin API; an admin is allowed (403 / 200)
- an over-long message is rejected by validation (400)

Also verified directly: OTP resend cooldown, the five-attempt cap (and
that the correct code stops working after lockout), the per-IP rate
limits (429), unauthenticated catalog writes (401), the notification
ownership check, and that the app refuses to boot in production with a
missing or default `JWT_SECRET`.

What is still **not** verified: the Docker image build (this sandbox
can't run a Docker daemon) and Android/iOS native builds (no Android SDK
or Xcode).

```bash
docker compose up -d          # starts Postgres 16 + PostGIS on :5432
cp .env.example .env
npm install
npx prisma migrate deploy     # applies prisma/migrations
npm run prisma:seed           # 38 makes/247 models + the 151-part dictionary
npm run start:dev
# → http://localhost:3000/api/v1
# → http://localhost:3000/api/docs  (Swagger, dev only)
```

## Security

Closed in the 2026-09-05 review, each verified against the running server:

| Gap | Fix |
|---|---|
| Catalog write endpoints were fully unauthenticated — anyone could inject rows into the dictionary customers see suggested | `@Roles('ADMIN')`; reads stay open for the request form |
| OTP had no expiry, no attempt cap and no resend cooldown — free SMS billing and a brute-forceable 6-digit code | 5-minute expiry, 5 attempts, 60-second cooldown, single use |
| No rate limiting anywhere | Global 60/min, 5/min on OTP send, 10/min on verify, 10/hour on posting requests |
| `JWT_SECRET` silently fell back to a dev default | Boot fails in production if it's missing or still the default |
| Unverified dealers could answer requests, bypassing the thing verification exists for | Verification checked on both the inbox and answering |
| Any user could mark any notification read | Scoped to the caller (their own, or their dealer's) |
| Dealers never saw their own in-app notifications | `GET /notifications` now includes rows addressed to the caller's dealer |
| Unbounded strings on messages and dealer registration | Length caps on every field; coordinates range-checked |
| `GET /dealers/:id` was public and returned the whole row | Requires a session and returns only the customer-facing fields |
| Swagger exposed the full API surface in production | Off unless `SWAGGER_ENABLED=true` |
| A second dealer registration crashed with a constraint error | Clean 409 |

Rate limits are per-instance and in-memory, as is the OTP store — fine
for the single-instance pilot, and the thing to move to Redis before
running more than one instance.

## Deploying

Host-agnostic — this runs unchanged on any platform that can run a
container and give it a `DATABASE_URL` (a VPS, Railway, Render, Fly.io,
ECS, ...). Picking that host, and creating its account, is a client
decision — nothing here is tied to one provider.

```bash
docker build -t qitaati-backend .
docker run -p 3000:3000 --env-file .env qitaati-backend
```

The `Dockerfile` is a two-stage build: `npm ci` → `prisma generate` →
`nest build` in the build stage (the exact commands verified in
"Status" above), then a slim runtime image with only production
dependencies + the compiled `dist/`. **Not yet run end-to-end as an
actual container** — the sandbox this was written in can't start a
Docker daemon (`dockerd` refuses to start: `ulimit: error setting limit
(Operation not permitted)`, a routine restriction for a container
without host Docker access) — so build it once yourself before relying
on it; the underlying commands it runs are individually verified.

Checklist for a real pilot deployment:

1. Provision a real Postgres (any managed provider) and point
   `DATABASE_URL` at it in `.env`.
2. `npx prisma migrate deploy && npm run prisma:seed` against it once,
   from wherever you can reach that database (locally, or a one-off
   container run).
3. Build and run the image above with a real `.env` — every var is in
   `.env.example`, with the account/credential each one needs (Claude,
   Twilio, Firebase, S3-compatible storage) already documented per
   section below.
4. Promote your own account to admin:
   `npm run promote:admin -- <your phone>` (see "Admin access").
5. Point the mobile app at it: run/build with
   `--dart-define=API_BASE_URL=https://your-domain/api/v1`
   (`mobile/lib/core/config/app_config.dart` — defaults to
   `localhost:3000` otherwise).

## Layout

```
legal/                     # privacy-policy-ar.md, terms-of-use-ar.md — served as-is by LegalController
prisma/
  schema.prisma             # full DB design (spec section 51 / review 7.2)
  seed.ts                    # loads seed-data/vehicles.ts + seed-data/parts.ts
  seed-data/vehicles.ts       # every mainstream make/model sold in Saudi Arabia
  seed-data/parts.ts           # canonical parts dictionary — 9 categories, 28 subcategories, 151 parts (Arabic + English + synonyms)
src/
  main.ts                  # bootstrap, global prefix /api/v1, Swagger
  app.module.ts             # wires every module below
  config/                   # one place for every external-service env var
  common/
    prisma/                 # PrismaService (injectable, connects on boot)
    event-bus/               # in-process pub/sub — modules never call each other directly
    geo/                     # haversine distance helper
  modules/
    identity/                # Users, Dealers, DealerDocuments, OTP auth, JWT
    catalog/                  # VehicleMakes/Models, PartCategories, CanonicalParts — read-only reference data for the request form
    requests/                  # PartRequest: customer posts one, dealers see the feed, a dealer answers
    conversations/              # chat between a customer and a dealer who answered
    notifications/               # in-app notifications + push, subscribes to domain events
    admin/                        # dealer verification, audit log, dashboard counts
    media/                         # presigned S3-compatible upload URLs for photos/documents
    legal/                          # serves legal/*.md over GET /legal/privacy-policy, /legal/terms-of-use
```

## Design decisions worth knowing before extending this

- **Every module owns its Prisma tables.** Cross-module reads go through a
  service call or an event (`common/event-bus`), never a direct query into
  another module's tables — that's what keeps a module splittable into its
  own service later without a rewrite (spec section 52).
- **The product is deliberately narrow.** A customer posts a part request
  (three fields + an optional photo), every verified dealer is notified,
  and a dealer who has it opens a conversation. There is no dealer
  inventory, no catalog browsing or search, no orders, no delivery and no
  ratings — the platform introduces the two sides and stays out of the
  deal (client decision, 2026-09-05). Those modules existed in the earlier
  marketplace design and were removed wholesale rather than left dormant;
  they're in git history if the scope ever widens.
- **OTP is behind `OTP_PROVIDER`** (`modules/identity/sms/`). `mock`
  (default) keeps the fixed dev code `0000` from `auth.service.ts`.
  `taqnyat` sends a real 6-digit code through Taqnyat (تقنيات), a Saudi
  gateway — the recommended one for a KSA launch, since sending A2P SMS to
  +966 numbers requires a locally registered sender name and the Saudi
  gateways handle that during onboarding; needs `TAQNYAT_TOKEN` +
  `TAQNYAT_SENDER`. `twilio` is the international alternative, needing the
  three `TWILIO_*` values. Both implement the same `OtpProvider`
  interface, so switching is one `.env` line. The Taqnyat request shape is
  taken from their published OpenAPI spec
  ([github.com/taqnyat/OpenAPI](https://github.com/taqnyat/OpenAPI/blob/main/sms/v1/openapi.yaml)),
  not guessed — but neither provider has been called against a live
  account from here, so send yourself one real code before opening a
  pilot.
- **Push is behind `PUSH_PROVIDER`** (`modules/notifications/push/`).
  `none` (default) is in-app only — `Notification` rows are still created
  and readable via `GET /notifications`, there's just no device wake-up.
  `fcm` sends real Firebase Cloud Messaging pushes via `FcmPushProvider`
  to whatever token the client last registered with
  `PATCH /notifications/push-token` — needs a Firebase project + the three
  `FCM_*` values in `.env.example` (a service-account key, not a Google
  Maps-style API key). Firebase initialization is deliberately lazy (inside
  `send()`, not the constructor): NestJS instantiates every provider a
  module lists regardless of which the `useFactory` selects, so an eager
  `initializeApp()` would crash boot on any install that never sets
  `FCM_*` — this bit the first draft of `FcmPushProvider` and was caught
  before commit.
- **Geo search is in-application (haversine), not PostGIS yet** — `docker-compose.yml`
  already runs the PostGIS image so that migration is just a query rewrite,
  not an infra change, when search volume justifies it (review section 7.3).
- **The dealer fan-out is a broadcast** (`modules/notifications`, on
  `PART_REQUEST_CREATED`): every VERIFIED dealer gets an in-app
  notification and a push. Right for a pilot with a handful of dealers;
  the obvious first refinement is targeting by make or city once an
  untargeted blast becomes noise.
- **Media upload is presign-then-PUT, not a proxy through the API.**
  `POST /media/uploads/presign` (`modules/media`) returns a short-lived S3
  PUT URL + the permanent public URL; the client uploads the file bytes
  directly to storage. Works with any S3-compatible provider (AWS S3,
  Cloudflare R2, MinIO for local dev) via `STORAGE_ENDPOINT` — nothing
  provider-specific in the code. Used for the optional photo on a request,
  images sent in chat, and dealer verification documents.
- **Legal docs are markdown files, not hardcoded strings.**
  `legal/privacy-policy-ar.md` and `legal/terms-of-use-ar.md` are the
  single source of truth; `modules/legal` just reads them off disk.
  Editing the wording is the entire "publish an update" workflow. Drafted
  from the PDPL/e-commerce research in the technical review (section 4) —
  flagged in both files as AI-drafted, not lawyer-certified.
- **Dealer-side endpoints resolve the dealer from the caller**, via
  `DealersService.findByOwner(user.userId)` — a dealer id is never taken
  from the request body, so one dealer can't act as another. Dealer *staff*
  as separate device accounts still isn't modelled; today the owner account
  is the dealer.
- **Chat access is checked on every read and write**
  (`ConversationsService.assertParticipant`), and which side you are is
  derived from that membership rather than trusted from the client.
- **Dealer registration promotes the owner's role.** `DealersService.register`
  runs the `Dealer` create and the owner's `User.role → DEALER_OWNER`
  update in one transaction. Verification status (the "✅ موثّق" badge,
  granted by an admin) is deliberately a separate field — a dealer gets the
  dealer app experience immediately, trust badge or not.
- **Only `VERIFIED` dealers are notified of requests** — verification is
  what stands between the request feed and anyone who signs up.

## The API, end to end

```
POST   /requests            customer posts one (partName, vehicleMake, vehicleModel, photoUrl?)
GET    /requests/mine       "طلباتي", with the dealers who answered
GET    /requests/:id        one request + its answers
PATCH  /requests/:id/close  "لقيت القطعة"
GET    /requests/inbox      dealer's feed of open requests
POST   /requests/:id/answer dealer says "عندي" → creates/returns the conversation
GET    /conversations       customer's threads
GET    /conversations/dealer  dealer's threads
GET    /conversations/:id/messages
POST   /conversations/:id/messages
```

## Pilot launch: what's real vs. what needs your credentials

Everything is code-complete; each remaining item is an external account
only the client can create (billing/ownership), not engineering work:

| Piece | Status | To activate |
|---|---|---|
| Parts dictionary | ✅ Done, seeded — 151 parts across 9 categories, Arabic + English + synonyms (`prisma/seed-data/parts.ts`), powering the part-name suggestions | Nothing — `npm run prisma:seed` loads it |
| SMS/OTP | ✅ Code complete (`TaqnyatOtpProvider`, `TwilioOtpProvider`) | Taqnyat or Twilio account → `OTP_PROVIDER=taqnyat\|twilio` |
| Push | ✅ Code complete (`FcmPushProvider` + the app's `PushService`) | Firebase project → `PUSH_PROVIDER=fcm`, `FCM_*` |
| Storage | ✅ Code complete (presigned S3) | Any S3-compatible bucket → `STORAGE_*` |

No AI account is needed any more: the dealer-side AI recognition was
removed with the pivot, since dealers no longer enter parts at all.

## Admin access

`/admin/*` is gated to `User.role === ADMIN` (`common/auth/roles.guard.ts`
+ `@Roles('ADMIN')` on `AdminController`) — no separate admin login;
`AdminUser` (in the schema) stays a plain audit-attribution table, not a
second auth system, per the client decision. There's no admin self-signup
by design. To grant it: sign up once through the normal OTP flow with the
phone you want as admin, then run

```bash
npm run promote:admin -- +9665XXXXXXXX
```

(`prisma/promote-admin.ts`) and log in again so the new JWT carries the
role.

## What's deliberately not here

Removed with the 2026-09-05 pivot, and recoverable from git history if the
scope ever widens: dealer inventory and listings, catalog search and
browsing, AI part recognition, orders and status tracking, delivery-fee
calculation, ratings and reviews, and abuse reports. Also still absent, as
before: payments, delivery-company integrations, and voice search.
