# Used-car-parts marketplace — project brief

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
field, canonical parts + bulk import endpoint, vehicle catalog, listings
CRUD + availability, text search with filters/sort, search-requests,
conversations + negotiation offers, orders + a pluggable delivery-fee
calculator, reviews + dealer rating recalculation, reports, notifications
(event-driven), admin dealer-verification + audit log, and the AI-vision
abstraction with a mock provider.

**Mobile**: full navigation shell (5 tabs, spec section 44), every screen
in the golden path (sections 45-47) as a real Flutter widget tree, backed
by mock data — no live API calls yet. Not run through the Flutter SDK (see
`mobile/README.md`) since this environment doesn't have it installed.

**Explicitly deferred to v2**, matching the review's MVP-scope call
(section 6): payments, external delivery-company API integration, dealer
inventory-system linking, voice search, very-advanced AI, structured
accept/reject negotiation UI (v1 ships free-text chat + one "agree"
button).

**Open decisions nothing in either source document settles** — still
needed before this goes further:

- App name (Arabic + English), branding, color palette, logo.
- Launch city and the 3-5 vehicle models for the pilot (review section 9
  recommends deciding this before building the canonical-parts seed list).
- Which provider for each external service in `backend/.env.example`: SMS/OTP,
  maps, push notifications, object storage, AI vision. All are coded
  behind swappable interfaces/config — the code doesn't block on this, but
  going live does.
- Legal: privacy policy + ToS text (PDPL-compliant), and confirming
  whether the municipal license requirement (review section 4.1) changes
  the dealer-documents review checklist beyond the one new field already
  added to the schema and the registration screen.
- A dedicated admin-role auth model — the admin API currently reuses the
  regular customer/dealer JWT guard as a placeholder (`backend/src/modules/admin/admin.controller.ts`).
