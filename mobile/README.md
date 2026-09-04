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
    api/                     # Dio client, JWT token storage, MediaUploadService
    config/                  # API base URL (--dart-define=API_BASE_URL)
    router/                  # go_router: shell (5 tabs) + pushed routes
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
(`core/api/api_client.dart`, a Dio wrapper that attaches the saved JWT):
OTP request/verify, home + search results (`GET /inventory/search`), part
details (`GET /inventory/listings/:id`), "ابحث لي عنها"
(`POST /inventory/search-requests`), the AI-photo flow in both
`image_search_screen.dart` and `add_listing_screen.dart` (upload via
`MediaUploadService` → `POST /ai/vision/recognize-part`), publishing a
listing (`POST /inventory/listings`), dealer registration
(`POST /dealers/register`), starting/reading/sending a chat + negotiation
offers (`/conversations/**`), the messages list (`GET /conversations`),
orders (`GET /orders`), and both legal documents
(`GET /legal/privacy-policy`, `GET /legal/terms-of-use`).

`add_listing_screen.dart` is the one screen where the AI response alone
isn't enough to publish: `POST /inventory/listings` requires a real
`canonicalPartId`, but the AI vision response only ever returns a free-text
guess. The screen fetches `GET /catalog/canonical-parts`, pre-selects the
closest name match to the AI's guess, and leaves it in an editable
dropdown — which is also just the confirm/edit contract spec section 10
requires, not a workaround.

## Known gaps in what's wired

- **Two home-screen rails are still placeholders** ("تشاليح قريبة",
  "أفضل التشاليح تقييمًا") — they need a dealer-list endpoint the backend
  doesn't have yet (only per-dealer `GET /dealers/:id` exists).
- **No 401 → `/login` auto-redirect.** A few screens (search-request,
  dealer registration) catch a 401 and push `/login` manually; screens that
  don't yet will just surface a generic error. A global Dio interceptor
  wired to the router (or a `GlobalKey<NavigatorState>`) would centralize
  this — worth doing once there's more than a couple of call sites.
- **No dealer-role routing.** `DealerDashboardScreen` is reachable but
  nothing checks `User.role` to route a dealer there automatically after
  login, or to gate `add-listing`/registration behind having a dealer
  profile at all.
- **Chat is text-only** — the image button in `conversation_screen.dart`
  is not wired to `MediaUploadService` yet, even though the pattern exists
  in the AI-capture screens.
- Push notifications (spec section 32) — no FCM/APNs setup yet.
- App icon, splash screen, real branding/colors (placeholder seed color in
  `core/theme/app_theme.dart`).
- English localization (intentionally deferred — see the note in `main.dart`).
