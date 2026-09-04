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
identity/auth (OTP behind a pluggable `mock`/`twilio` provider), dealer
registration with the municipal-license field, canonical parts + bulk
import endpoint (now seeded with a real 151-part dictionary — see
"Decisions" below), vehicle catalog (seeded with 38 makes / 247 models),
listings CRUD + availability, text search with filters/sort,
search-requests, conversations + negotiation offers, orders + a pluggable
delivery-fee calculator, reviews + dealer rating recalculation, reports,
notifications (event-driven, in-app + a pluggable `none`/`fcm` push
provider), admin dealer-verification + audit log, the AI-vision
abstraction behind a pluggable `mock`/`claude` provider, presigned
S3-compatible media uploads, and a legal module serving the drafted
privacy policy + terms of use.

**Mobile**: full navigation shell (5 tabs, spec section 44), every screen
in the golden path (sections 45-47) as a real Flutter widget tree, fully
wired to the real backend rather than mock data — including both home
rails, session handling (global 401 → logout redirect), and
role-based routing straight to the dealer dashboard after a dealer logs
in (which required fixing a real backend gap: registering as a dealer
never used to promote the owner's `User.role`, so no login could ever
actually reach that experience). Device location is wired end to end
too: one shared `tryGetCurrentPosition()` call per screen feeds real
GPS coordinates into dealer search, listing search, and part details,
so "الأقرب" sorting and every distance badge in the UI are backed by
real data, not left blank — degrading gracefully (unsorted results, no
badge, never an error) wherever location permission isn't granted.

**Actually verified, not just written**, as of a later session that
installed Flutter 3.47.2 stable: `flutter create .` generated the real
`android`/`ios`/`web` platform folders (now tracked in git, including
the location + camera/photo-library permission entries added by hand
afterward — see `mobile/README.md`), `flutter analyze` comes back with
zero issues, `flutter test` passes, and `flutter build web --release`
compiles the entire app cleanly. Android/iOS builds themselves weren't
reachable (that environment's network policy blocks `dl.google.com`,
so no Android SDK; no Xcode available for iOS either) — but the same
Dart compiler frontend backs every platform, so a clean web build is
strong evidence the same code is clean there too. What's genuinely
still unverified is the Gradle/Kotlin and Xcode/CocoaPods build
configs themselves, both stock `flutter create` output.

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
  is seeded too now: 151 real parts across 9 top categories and 28
  subcategories (`backend/prisma/seed-data/parts.ts`), Arabic + English
  names plus search synonyms for each — general-purpose taxonomy (a
  headlight, an alternator, a brake caliper), not per-make/model part
  numbers, which stays a separate, larger research task if the client
  wants OEM-number-level matching later.
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

## Pilot launch readiness (2026-09-04)

The client asked for a real pilot: parts dictionary, a real AI account, and
a real SMS account. All three are code-complete; each remaining item is an
external account only the client can create (billing/ownership), not
engineering work:

| Piece | Status | To activate |
|---|---|---|
| Parts dictionary | ✅ Done — 151 parts seeded | Nothing further |
| AI vision (`ClaudeVisionProvider`) | ✅ Code complete | Anthropic API key → `AI_VISION_PROVIDER=claude` |
| SMS/OTP (`TwilioOtpProvider`) | ✅ Code complete | Twilio account → `OTP_PROVIDER=twilio` |
| Push (`FcmPushProvider`) | ✅ Code complete | Firebase project → `PUSH_PROVIDER=fcm` |

Push specifically wasn't wired earlier in the session because, until this
round, nothing had asked for it yet — it needs the exact same kind of
missing piece the SMS provider did (an external account under the
client's ownership), not a harder engineering problem. The plumbing
(`backend/src/modules/notifications/push/`, `PATCH /notifications/push-token`)
is now built the same way OTP and AI vision are: a swappable provider that
defaults to a safe no-op so the app keeps working with zero setup, and
upgrades to the real thing the moment credentials exist. Full activation
steps for all three (where to get each credential, exactly which env vars)
are in `backend/README.md` and `backend/.env.example`.

## What's left that I genuinely can't finish myself, and why

Asked directly whether I could complete everything remaining before a real
pilot launch (2026-09-04). Split honestly into what's actual engineering
(mine to do) versus what needs the client's own identity/ownership (not a
harder technical problem — a boundary I shouldn't cross even where
technically possible):

**Done this round, no client action needed:**
- `backend/Dockerfile` + `.dockerignore` — a two-stage production build
  (build stage: `npm ci` → `prisma generate` → `nest build`; runtime
  stage: prod-only deps + the copied Prisma client + `dist/`). Written to
  run unchanged on any container host. The individual commands it runs
  are all independently verified in this session; the containerized
  build itself isn't, since this environment's sandbox can't start a
  Docker daemon (`dockerd` refuses: `ulimit: error setting limit
  (Operation not permitted)`) — build it once yourself before relying on
  it.
- `backend/README.md` "Deploying" — the concrete checklist to take that
  image from build to a running pilot: provision Postgres, migrate +
  seed, run the image with a real `.env`, promote an admin, point the
  mobile app at the deployed URL via `--dart-define=API_BASE_URL=...`.
- Closed the admin-access gap (see below).

**Genuinely outside what I can do, not just what this sandbox allows:**
- Creating the Anthropic/Twilio/Firebase/storage accounts themselves —
  each needs the client's own identity, payment method, and ToS
  acceptance. I can wire the code the moment credentials exist (already
  done, see "Pilot launch readiness" above), but creating the account is
  the client's step by nature, not a delegable one.
- Actually provisioning and paying for a live production host/database —
  same reason; the Dockerfile + checklist make that a same-day task once
  the client picks and pays for a host, not an engineering blocker.
- A real Android/iOS build artifact — this specific sandbox blocks the
  Android SDK download (`dl.google.com` is outside its network policy)
  and has no Xcode for iOS. This one *is* an environment limit rather
  than a client-identity one: the mobile code itself is verified
  (`flutter analyze` clean, `flutter build web --release` compiles), so
  `flutter build apk` in any normal dev machine or CI runner should just
  work — worth trying in an environment with the Android SDK reachable
  before assuming it needs more work.
- A lawyer's actual certification of the drafted legal docs — I can draft
  and revise the text, not certify it.

## Still open

- Branding beyond the name: color palette, logo (placeholder seed color in
  `mobile/lib/core/theme/app_theme.dart`).
- Per-make/model OEM part numbers — the seeded dictionary is general parts
  taxonomy, not vehicle-specific part-number matching (see "Decisions"
  above).
- Storage provider (Cloudflare R2 is a reasonable default — cheap, no
  egress fees, drop-in with the existing S3-compatible config) — the only
  remaining piece with no code-complete real provider yet, since the
  client hasn't picked a bucket/CDN host.
- A final legal-counsel pass on the drafted privacy policy/ToS before
  public launch, and confirming whether the municipal license requirement
  (review section 4.1) changes the dealer-documents review checklist
  beyond the one field already added to the schema and the registration
  screen.
- ~~A dedicated admin-role auth model~~ — closed: `/admin/*` now requires
  `User.role === ADMIN` (`backend/src/common/auth/roles.guard.ts`). No
  self-signup by design; promote a user with
  `npm run promote:admin -- <phone>` (`backend/prisma/promote-admin.ts`)
  after they've logged in once normally. `AdminUser` in the schema stays
  a plain audit-attribution table, not a second login system.
