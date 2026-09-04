# قطعتي — used-car-parts marketplace — project brief

Source documents (the client's original requirements, in Arabic, provided
as .docx and not duplicated here):

1. **الوثيقة الأصلية** — 58-section requirements doc: what the customer and
   dealer apps must do, the golden-path user journeys, and the open
   questions the client put to "the programmer" (section 56).
2. **دراسة وتحليل فني** — a technical review of (1): flags the canonical
   parts taxonomy, cold-start, and bulk-inventory-import gaps; researches
   the Saudi municipal licensing requirement for vehicle-teardown shops
   (1446H/2025) and PDPL; and answers the architecture/DB/tech-stack
   questions from section 56.

This file is the synthesis those two turned into code — what's actually
built in `../backend` and `../mobile`, and what's still a decision or a
TODO.

## Product in one line

Customer searches a part ("صدام كامري 2022"), sees what's in stock across
registered dealers with price/photos/condition/rating/distance, negotiates
in-app, agrees on pickup or delivery. The platform is a technical
intermediary only — no payments, no ownership of parts, no party to the
sale (spec sections 1, 27-28).

## Architecture: Modular Monolith

One backend, split internally into domain modules with clear boundaries,
rather than microservices from day one (unjustified operational complexity
for MVP-scale traffic) or a single undifferentiated codebase (the client's
explicit worry in section 52 — "لا أريد بناء النظام بطريقة يصعب تطويرها
لاحقًا"). Modules talk through service calls or an event bus, never by
querying another module's tables directly — see `backend/README.md` for
the concrete rule and `backend/src/common/event-bus/`.

```
Mobile app (Flutter)  ──┐
                         ├──▶  API Gateway (NestJS, /api/v1)
Admin dashboard (future,│        │
web, same API) ─────────┘        ├─ identity        (users, dealers, auth)
                                  ├─ catalog          (vehicles, canonical parts)
                                  ├─ inventory         (listings, search, search-requests)
                                  ├─ conversations      (chat, negotiation)
                                  ├─ orders              (order, delivery fee)
                                  ├─ trust                (reviews, reports)
                                  ├─ notifications          (event-driven)
                                  ├─ admin                   (verification, audit log)
                                  └─ ai                       (vision, pluggable provider)
                                        │
                                  PostgreSQL (+ PostGIS, not yet used)
```

Why this split and not something else, why Flutter, why Postgres over a
managed search service, how AI recognition is meant to degrade gracefully
— all argued in the technical review document (section 7). The code
follows those decisions; re-argue there, not here, if reconsidering one.

## Database

Full schema: `backend/prisma/schema.prisma`. Every entity from the review's
section 7.2 table is modeled, plus the ones the review flagged as missing
from the client's original section 51 list: `CanonicalPart` (synonym +
OEM-number dictionary — the single most important missing piece, per the
review), `SearchRequest`/`SearchRequestOffer` ("ابحث لي عنها"), and
`AuditLog`.

## What's built vs. what's a decision or TODO

**Built and verified** (backend compiles clean, boots, maps every route —
see `backend/README.md` for the exact verification steps run):
identity/auth (mocked OTP), dealer registration with the municipal-license
field, canonical parts + bulk import endpoint, vehicle catalog (seeded with
38 makes / 247 models — see "Decisions" below), listings CRUD +
availability, text search with filters/sort, search-requests, conversations
+ negotiation offers, orders + a pluggable delivery-fee calculator, reviews
+ dealer rating recalculation, reports, notifications (event-driven), admin
dealer-verification + audit log, the AI-vision abstraction with a mock
provider, presigned S3-compatible media uploads, and a legal module serving
the drafted privacy policy + terms of use.

**Mobile**: full navigation shell (5 tabs, spec section 44), every screen
in the golden path (sections 45-47) as a real Flutter widget tree, backed
by mock data — no live API calls yet. Not run through the Flutter SDK (see
`mobile/README.md`) since this environment doesn't have it installed.

**Explicitly deferred to v2**, matching the review's MVP-scope call
(section 6): payments, external delivery-company API integration, dealer
inventory-system linking, voice search, very-advanced AI, structured
accept/reject negotiation UI (v1 ships free-text chat + one "agree"
button).

## Decisions made by the client (2026-09-04)

- **App name:** قطعتي (Arabic only for now). Reflected in the mobile app
  title (`mobile/lib/main.dart`) and the backend's Swagger title
  (`backend/src/main.ts`). The Flutter package's technical id
  (`carparts_app` in `pubspec.yaml`) is left as-is — that's an internal
  identifier, not user-facing, so renaming it buys nothing.
- **Launch city:** الرياض only. No code change needed — `city` was already
  a free-text field.
- **Vehicle makes/models: all of them**, not a 3-5-model pilot list.
  Seeded 38 makes and 247 models covering the mainstream Saudi market
  (`backend/prisma/seed-data/vehicles.ts`, loaded by `backend/prisma/seed.ts` —
  run via `npm run prisma:seed`). Read as "every make/model actually driven
  in KSA," not literally every vehicle ever made worldwide — that would be
  unbounded and useless for a search index. The canonical-parts dictionary
  (which parts exist per model) is a separate, still-open seeding task —
  linking specific parts to specific models is real research, not something
  to bulk-generate the way makes/models were.
- **Maps: none.** No paid Maps SDK/API key, no on-screen map. Distance
  search and the delivery-fee calculator (spec sections 8, 25) are kept —
  they only ever needed plain lat/lng numbers and a haversine formula
  (`backend/src/common/geo/haversine.ts`), not a maps *service*. The
  `MAPS_PROVIDER`/`MAPS_API_KEY` config was removed
  (`backend/src/config/configuration.ts`) since nothing used it; the
  mobile app is expected to read lat/lng from the device's own GPS
  permission (added `geolocator` to `mobile/pubspec.yaml`), not a map
  widget. If "no maps" was meant to also drop distance search/delivery
  pricing entirely, say so — that's a different, larger change.
- **SMS:** confirmed scope — used only for the login/registration OTP
  (customer and dealer), never for order/chat/other notifications (those
  go through the notifications module + push). This already matches how
  the code is split; no change needed.
- **Storage: still needed, confirmed.** The client's own description of the
  dealer flow (photo → AI confirms → dealer adds price → publish) still
  needs it — the photo has to outlive the AI call so every future customer
  browsing the listing can see it (spec sections 15, 20); AI recognition
  being confirm-only doesn't remove that. Built `backend/src/modules/media`:
  `POST /media/uploads/presign` returns a short-lived S3-compatible PUT URL
  + the permanent public URL, the client uploads the file directly to
  storage (no large file bodies proxied through the API), and that same
  URL feeds both the AI-recognition call and the published listing. Works
  with any S3-compatible provider (AWS S3, Cloudflare R2, MinIO for local
  dev) — provider itself still not chosen, see "Still open".
- **Legal: drafted by Claude**, at the client's request, rather than
  waiting on a lawyer first. `backend/legal/privacy-policy-ar.md` and
  `backend/legal/terms-of-use-ar.md`, served via `GET /legal/privacy-policy`
  and `GET /legal/terms-of-use` (`backend/src/modules/legal`) so editing the
  markdown file is the entire "publish an update" workflow. Linked from both
  the customer OTP screen and the dealer registration screen's consent
  checkbox in the mobile app. Both files carry a disclaimer at the top:
  AI-drafted from the PDPL/e-commerce research already done, not
  lawyer-certified — worth one real legal pass before public launch, same
  as the original spec document itself said about its own legal sections.

## Still open

- Branding beyond the name: color palette, logo (placeholder seed color in
  `mobile/lib/core/theme/app_theme.dart`).
- The canonical-parts dictionary content (which parts exist per seeded
  model) — a real research task, unlike the makes/models bulk seed above.
- Storage provider (Cloudflare R2 is a reasonable default — cheap, no
  egress fees, drop-in with the existing S3-compatible config), push
  notification provider, AI vision provider — all coded behind swappable
  config/interfaces, so this doesn't block development, only going live.
- A final legal-counsel pass on the drafted privacy policy/ToS before
  public launch, and confirming whether the municipal license requirement
  (review section 4.1) changes the dealer-documents review checklist
  beyond the one field already added to the schema and the registration
  screen.
- A dedicated admin-role auth model — the admin API currently reuses the
  regular customer/dealer JWT guard as a placeholder (`backend/src/modules/admin/admin.controller.ts`).
