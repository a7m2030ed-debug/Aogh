# Backend (NestJS API)

Modular-monolith backend for the used-car-parts marketplace platform —
architecture matches section 7.1-7.2 of the technical review in
`../docs/project-brief.md`.

## Status

Verified in this environment (no Docker/Postgres available here):

- `npm install` — clean
- `npx prisma generate` — schema is valid
- `npx nest build` — zero TypeScript errors across every module
- `node dist/main.js` — boots, wires all modules, maps every route (fails
  only on the DB connection, since no Postgres is reachable here)

**Not yet verified against a real database** — do that first, locally:

```bash
docker compose up -d          # starts Postgres 16 + PostGIS on :5432
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run prisma:seed           # loads 38 makes/247 models + the 151-part canonical dictionary — see prisma/seed.ts
npm run start:dev
# → http://localhost:3000/api/v1
# → http://localhost:3000/api/docs  (Swagger)
```

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
    identity/                # Users, Dealers, DealerDocuments, OTP auth, JWT; GET /dealers lists verified dealers (nearby/rating sort)
    catalog/                  # VehicleMakes/Models, PartCategories, CanonicalParts
    inventory/                 # Listings, text search, "ابحث لي عنها" search requests
    conversations/              # chat + negotiation offers, GET /conversations lists the caller's own
    orders/                      # order creation, status history, delivery fee calculator, GET /orders lists the caller's own
    trust/                        # reviews, reports
    notifications/                 # in-app notifications, subscribes to domain events
    admin/                          # dealer verification, audit log, dashboard counts
    ai/                              # AiVisionProvider interface + MockVisionProvider + ClaudeVisionProvider
    media/                            # presigned S3-compatible upload URLs for photos/videos/documents
    legal/                             # serves legal/*.md over GET /legal/privacy-policy, /legal/terms-of-use
```

## Design decisions worth knowing before extending this

- **Every module owns its Prisma tables.** Cross-module reads go through a
  service call or an event (`common/event-bus`), never a direct query into
  another module's tables — that's what keeps a module splittable into its
  own service later without a rewrite (spec section 52).
- **AI vision is behind `AI_VISION_PROVIDER`** (`modules/ai/ai-vision.interface.ts`).
  `mock` (default) returns canned suggestions with no external call.
  `claude` uses `ClaudeVisionProvider` — real recognition via
  `claude-opus-5`, given the photo plus the live canonical-parts list from
  `CanonicalPartsService`, using structured output (`messages.parse` +
  `zodOutputFormat`) so a `canonicalPartId` is only ever returned when it
  matches a real catalog row, never fabricated. The API contract always
  returns suggestions + a confidence score, never a single answer —
  enforced in `ai-vision.service.ts` per spec sections 10/57. Needs only
  `AI_VISION_PROVIDER=claude` + `AI_VISION_API_KEY` (see `.env.example`).
- **OTP is behind `OTP_PROVIDER`** (`modules/identity/sms/`). `mock`
  (default) keeps the fixed dev code `0000` from `auth.service.ts`.
  `twilio` sends a real 6-digit SMS code via `TwilioOtpProvider` — needs
  only a Twilio account + the three `TWILIO_*` values in `.env.example`.
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
- **Delivery fee is one method** (`modules/orders/delivery-fee.calculator.ts`)
  so the "no flat 25/30 SAR forever" requirement (spec section 25) is a
  one-file change, not scattered across the order flow.
- **Media upload is presign-then-PUT, not a proxy through the API.**
  `POST /media/uploads/presign` (`modules/media`) returns a short-lived S3
  PUT URL + the permanent public URL; the client uploads the file bytes
  directly to storage. Works with any S3-compatible provider (AWS S3,
  Cloudflare R2, MinIO for local dev) via `STORAGE_ENDPOINT` — nothing
  provider-specific in the code. Still needed even with the confirm-only
  AI flow the client described: the photo has to outlive the AI call so
  every future customer sees it on the published listing.
- **Legal docs are markdown files, not hardcoded strings.**
  `legal/privacy-policy-ar.md` and `legal/terms-of-use-ar.md` are the
  single source of truth; `modules/legal` just reads them off disk.
  Editing the wording is the entire "publish an update" workflow. Drafted
  from the PDPL/e-commerce research in the technical review (section 4) —
  flagged in both files as AI-drafted, not lawyer-certified.
- Several endpoints (e.g. `dealerId` on listing creation) currently take it
  from `user.userId` as a placeholder — see the `// NOTE` comments in
  `listings.controller.ts` and `search-requests.controller.ts`. Wiring an
  actual dealer-staff permission model is flagged there, not silently
  assumed.
- **Dealer registration promotes the owner's role.** `DealersService.register`
  runs the `Dealer` create and the owner's `User.role → DEALER_OWNER`
  update in one transaction. Verification status (the "✅ موثّق" badge,
  granted by an admin) is deliberately a separate field — a dealer gets the
  dealer app experience immediately, trust badge or not.
- **`GET /dealers` only ever returns `VERIFIED` dealers** — the two
  customer-facing home rails ("تشاليح قريبة", "أفضل التشاليح تقييمًا")
  should mean the trust badge is real, not just decorative next to
  unverified listings.

## Mobile app now calls this for real

`../mobile` was rewired in the same round these list-mine endpoints were
added — every screen calls its real endpoint instead of rendering mock
data (see `../mobile/README.md` for the full map and the couple of gaps
still open there, like true GPS-based "nearby" sorting).

## Pilot launch: what's real vs. what needs your credentials

All three pieces the client asked for to run a real pilot are code-complete;
each is gated purely on an external account that only the client can create
(billing/ownership), not on any remaining engineering work:

| Piece | Status | To activate |
|---|---|---|
| Parts dictionary | ✅ Done, seeded — 151 real parts, 9 categories, 28 subcategories, Arabic + English + synonyms (`prisma/seed-data/parts.ts`) | Nothing — `npm run prisma:seed` loads it |
| AI vision | ✅ Code complete (`ClaudeVisionProvider`) | Anthropic API key → `AI_VISION_PROVIDER=claude`, `AI_VISION_API_KEY` |
| SMS/OTP | ✅ Code complete (`TwilioOtpProvider`) | Twilio account → `OTP_PROVIDER=twilio`, `TWILIO_*` |
| Push | ✅ Code complete (`FcmPushProvider`) | Firebase project → `PUSH_PROVIDER=fcm`, `FCM_*` |

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

## What's deliberately not here yet

Matches the review's MVP-scope recommendation (section 6): payments,
external delivery-company APIs, dealer inventory-system integration,
voice search, and structured accept/reject negotiation UI backend.
