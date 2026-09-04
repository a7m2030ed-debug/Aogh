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
npm run prisma:seed           # loads 38 makes / 247 models — see prisma/seed.ts
npm run start:dev
# → http://localhost:3000/api/v1
# → http://localhost:3000/api/docs  (Swagger)
```

## Layout

```
legal/                     # privacy-policy-ar.md, terms-of-use-ar.md — served as-is by LegalController
prisma/
  schema.prisma             # full DB design (spec section 51 / review 7.2)
  seed.ts                    # loads seed-data/vehicles.ts (38 makes, 247 models)
  seed-data/vehicles.ts       # every mainstream make/model sold in Saudi Arabia
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
    catalog/                  # VehicleMakes/Models, PartCategories, CanonicalParts
    inventory/                 # Listings, text search, "ابحث لي عنها" search requests
    conversations/              # chat + negotiation offers
    orders/                      # order creation, status history, delivery fee calculator
    trust/                        # reviews, reports
    notifications/                 # in-app notifications, subscribes to domain events
    admin/                          # dealer verification, audit log, dashboard counts
    ai/                              # AiVisionProvider interface + MockVisionProvider
    media/                            # presigned S3-compatible upload URLs for photos/videos/documents
    legal/                             # serves legal/*.md over GET /legal/privacy-policy, /legal/terms-of-use
```

## Design decisions worth knowing before extending this

- **Every module owns its Prisma tables.** Cross-module reads go through a
  service call or an event (`common/event-bus`), never a direct query into
  another module's tables — that's what keeps a module splittable into its
  own service later without a rewrite (spec section 52).
- **AI vision is behind `AI_VISION_PROVIDER`** (`modules/ai/ai-vision.interface.ts`).
  Swap `MockVisionProvider` for a real one in `ai.module.ts`; nothing else
  changes. The API contract always returns suggestions + a confidence
  score, never a single answer — enforced in `ai-vision.service.ts` per
  spec sections 10/57.
- **OTP is mocked** (`modules/identity/auth.service.ts`, fixed code `0000`)
  until an SMS gateway is chosen (review section 7.6).
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

## What's deliberately not here yet

Matches the review's MVP-scope recommendation (section 6): payments,
external delivery-company APIs, dealer inventory-system integration,
voice search, structured accept/reject negotiation UI backend, and a
dedicated admin-role auth guard (the admin routes use the same JWT guard
as everyone else right now — see the `// TODO` in `admin.controller.ts`).
