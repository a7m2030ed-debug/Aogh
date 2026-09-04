# Mobile app (Flutter)

Customer + dealer app for the used-car-parts marketplace. Arabic-first, RTL
by default (spec section 43).

## Status

**Verified, not just written.** Most of this app was originally written
blind (no Flutter SDK in that environment), but a later session installed
Flutter 3.47.2 stable for real and ran it through the actual toolchain:

- `flutter create .` generated the real `android/`, `ios/`, `web/`
  platform folders (previously absent by design — see git history if you
  need the "here's how to do it yourself" version of this section).
- `flutter pub get` — clean (had to bump `intl` to `^0.20.3`; the SDK's
  `flutter_localizations` requires it, `^0.19.0` didn't resolve).
- `flutter analyze` — **zero issues.** Every finding it surfaced the first
  time (an unused import, two `DropdownButtonFormField.value` deprecations,
  a default `test/widget_test.dart` still referencing the counter-app
  template's `MyApp`) is fixed in the code, not suppressed — except one
  `use_build_context_synchronously` info in `api_client.dart`'s 401
  handler, which is a deliberate, commented `// ignore:` (the context
  there is a fresh `GlobalKey.currentContext` lookup made after the await,
  not a stale captured one — verified against the `DropdownButtonFormField`
  source too, to confirm `initialValue` still re-syncs on external changes
  via its own `didUpdateWidget`, same as the deprecated `value` did, before
  relying on it for the AI-preselect flow in `add_listing_screen.dart`).
- `flutter test` — passes (replaced the irrelevant default counter test).
- `flutter build web --release` — **builds clean**, full production
  compile of every file in `lib/`, icon fonts tree-shaken. This is the
  strongest verification available in that environment: android/ios
  builds need an Android SDK / Xcode this environment's network policy
  couldn't fetch (`dl.google.com` isn't reachable through its proxy), but
  the Dart compiler frontend that catches type/API errors is the same one
  for every platform — a clean web build means the same errors would be
  clean on Android/iOS too. What's *not* verified: Gradle/Kotlin-side
  Android build config, and Xcode/CocoaPods-side iOS config, since neither
  toolchain was reachable — both are stock, unmodified `flutter create`
  output apart from the permission-file edits below, so risk there is low,
  but "low risk" isn't "verified."

Location permission entries (Android `AndroidManifest.xml`, iOS
`Info.plist`) and camera/photo-library usage descriptions (iOS) are
already added — see the location section below.

To run it:

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

## What's here

```
android/, ios/, web/       # real flutter create output, tracked in git (not regenerated on clone)
test/widget_test.dart      # smoke test: app builds, home screen renders
lib/
  main.dart                 # MaterialApp.router, RTL wrapper, theme
  core/
    api/                     # Dio client (with a global 401 handler), JWT token storage, MediaUploadService
    config/                  # API base URL (--dart-define=API_BASE_URL)
    location/                # device_location.dart — geolocator wrapped behind a call that never throws
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

**Location is wired end to end, gracefully degrading without it.**
`core/location/device_location.dart`'s `tryGetCurrentPosition()` resolves
once per screen (home, search results, and part details each share one
call rather than prompting three times) and feeds `lat`/`lng` into
`GET /dealers`, `GET /inventory/search`, and `GET /inventory/listings/:id`
— all three backend endpoints already accepted these params for exactly
this, they just weren't being sent before. The "الأقرب" chip on search
results and the nearby-dealers home rail now do true distance sort;
`ListingCard` and the dealer cards show the km badge whenever a position
resolves. If location is off, denied, or the permission entries below
aren't in place yet, every one of these calls still succeeds — they just
come back unsorted / without a distance badge, never an error screen.

**Platform permission entries are already in place**, not just documented:
`android/app/src/main/AndroidManifest.xml` has
`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`, and `ios/Runner/Info.plist`
has `NSLocationWhenInUseUsageDescription` — plus `NSCameraUsageDescription`
and `NSPhotoLibraryUsageDescription` for `image_picker` (sections 9, 12),
which iOS requires or it terminates the app outright the first time a
screen opens the camera/gallery, rather than just failing that one call.
None of these existed before `flutter create .` ran; all three were added
by hand afterward, in the actual generated files.

## Known gaps in what's wired

- **No fine-grained dealer-staff permissions** — any authenticated user can
  currently create a listing under a `dealerId` in a way that isn't
  actually checked against their own dealer profile (see the `// NOTE`
  comments in `listings.controller.ts`/`search-requests.controller.ts` on
  the backend).
- Push notifications (spec section 32) — no FCM/APNs setup yet.
- App icon, splash screen, real branding/colors (placeholder seed color in
  `core/theme/app_theme.dart`).
- English localization (intentionally deferred — see the note in `main.dart`).
