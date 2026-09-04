# Mobile app (Flutter)

Customer + dealer app for the used-car-parts marketplace. Arabic-first, RTL
by default (spec section 43).

## Status

Written without the Flutter SDK available in the environment that created
it, so it has **not** been run through `flutter pub get` / `flutter
analyze` / `flutter run`. The Dart code follows standard, current APIs for
the packages in `pubspec.yaml`, and every screen below is wired to a real
backend call (not mock data) — but treat all of it as unverified until the
steps below are run once, since nothing here has actually compiled yet.

The `android/`, `ios/`, `web/` platform folders are intentionally not
included — they're generated, not hand-written. Set them up once:

```bash
cd mobile
flutter create --project-name carparts_app --org com.example .   # adds android/, ios/, web/ around the existing lib/
flutter pub get
flutter analyze                                                   # fix whatever the real SDK flags
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

## What's here

```
lib/
  main.dart                 # MaterialApp.router, RTL wrapper, theme
  core/
    api/                     # Dio client (with a global 401 handler), JWT token storage, MediaUploadService
    config/                  # API base URL (--dart-define=API_BASE_URL)
    router/                  # go_router: shell (5 tabs) + pushed routes; navigator_key.dart lets ApiClient navigate without a BuildContext
    theme/                   # placeholder color seed — swap for real branding
    utils/                   # phone number → E.164 normalizer
  features/
    auth/                    # phone + OTP (spec section 4) — real /auth/otp/* calls
    search/                  # home, text search results, image search (6-10, 18-19, 31)
    catalog/                 # part details (20)
    chat/                    # conversation + negotiation strip (21-23), messages list
    orders/                  # my orders (33-34)
    dealer/                  # dashboard, add-listing (11-14), dealer registration (5)
    legal/                   # fetches privacy policy / terms of use from the backend
    profile/                 # account tab (44)
  shared/
    models/                  # Listing.fromJson — maps the backend's actual search/listing response shape
    widgets/                 # ListingCard, bottom-nav shell
```

## Wired to the real backend

Every screen calls its real endpoint via `ApiClient`
(`core/api/api_client.dart`, a Dio wrapper that attaches the saved JWT and
handles session expiry globally — see below): OTP request/verify, home +
search results (`GET /inventory/search`), the "تشاليح قريبة" / "أفضل
التشاليح تقييمًا" home rails and part details (`GET /dealers`,
`GET /inventory/listings/:id`), "ابحث لي عنها"
(`POST /inventory/search-requests`), the AI-photo flow in both
`image_search_screen.dart` and `add_listing_screen.dart` (upload via
`MediaUploadService` → `POST /ai/vision/recognize-part`), publishing a
listing (`POST /inventory/listings`), dealer registration
(`POST /dealers/register`), chat — text, image, and negotiation offers
alike — (`/conversations/**`), the messages list (`GET /conversations`),
orders (`GET /orders`), account logout, and both legal documents
(`GET /legal/privacy-policy`, `GET /legal/terms-of-use`).

`add_listing_screen.dart` is the one screen where the AI response alone
isn't enough to publish: `POST /inventory/listings` requires a real
`canonicalPartId`, but the AI vision response only ever returns a free-text
guess. The screen fetches `GET /catalog/canonical-parts`, pre-selects the
closest name match to the AI's guess, and leaves it in an editable
dropdown — which is also just the confirm/edit contract spec section 10
requires, not a workaround.

**Session handling is global, not per-screen.** `ApiClient` installs one
Dio interceptor that, on any 401 (except the OTP endpoints themselves,
which use 401 to mean "wrong code" rather than "expired session"), clears
the saved token and navigates to `/login` via `rootNavigatorKey`
(`core/router/navigator_key.dart`) — a small file kept separate from
`app_router.dart` specifically so importing it from `core/api/` doesn't
create a circular import through every screen `app_router.dart` pulls in.
Individual screens no longer special-case 401 themselves.

**Dealers get routed to their own dashboard automatically.** Registering
as a dealer (`POST /dealers/register`) now also promotes the owner's
`User.role` to `DEALER_OWNER` on the backend (it didn't before — a real
gap, since without it no login could ever actually reach the dealer
experience). After OTP verify, the app fetches `GET /users/me` and routes
to `/dealer/dashboard` instead of `/` when the role is a dealer role.

## Known gaps in what's wired

- **"تشاليح قريبة" isn't true distance order yet** — `GET /dealers?sort=nearest`
  works, but nothing on the client passes the device's lat/lng, so it falls
  back to the same unsorted verified-dealer list as "الأحدث" would. Wiring
  the already-added `geolocator` dependency (permission request +
  `getCurrentPosition()`) is the remaining step, plus the location
  permission entries `flutter create .` doesn't add to the platform
  manifests on its own.
- **No fine-grained dealer-staff permissions** — any authenticated user can
  currently create a listing under a `dealerId` in a way that isn't
  actually checked against their own dealer profile (see the `// NOTE`
  comments in `listings.controller.ts`/`search-requests.controller.ts` on
  the backend).
- Push notifications (spec section 32) — no FCM/APNs setup yet.
- App icon, splash screen, real branding/colors (placeholder seed color in
  `core/theme/app_theme.dart`).
- English localization (intentionally deferred — see the note in `main.dart`).
