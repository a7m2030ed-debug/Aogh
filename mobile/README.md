# Mobile app (Flutter)

## ⚠️ Rebuilt around a narrower product — 2026-09-05

The app is no longer a marketplace. There is no search, no listings, no
part-details page, no orders and no AI capture — those screens were
deleted. What the app does now:

**Customer** (four tabs — `shared/widgets/app_bottom_nav_shell.dart`):
- **اطلب قطعة** (`features/requests/new_request_screen.dart`) — the home
  screen and the whole product: part name (free text with suggestions from
  the seeded parts dictionary), car make and model (dropdowns from the
  vehicle catalog), and an optional photo. `POST /requests`.
- **طلباتي** (`features/requests/my_requests_screen.dart`) — each request
  with how many dealers answered; tapping through
  (`request_details_screen.dart`) lists them and opens a thread.
- **الرسائل** — conversation list.
- **حسابي**.

**Dealer** (`features/dealer/dealer_dashboard_screen.dart`, reached by the
role redirect after login): a feed of open customer requests, each with an
"عندي هذي القطعة" button that opens a conversation
(`POST /requests/:id/answer`). Plus their own chat list and profile.

Chat (`features/chat/conversation_screen.dart`) is plain messaging — the
price/offer/"تم الاتفاق" strip went with the pivot. Which side is "me" is
resolved from `core/session/current_user.dart`, so the same screen renders
correctly for both.


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
    push/                    # push_service.dart — FCM token registration, no-ops with no Firebase config
    router/                  # go_router: customer shell (4 tabs) + pushed routes; navigator_key.dart lets ApiClient navigate without a BuildContext
    session/                 # current_user.dart — cached GET /users/me (role, id)
    theme/                   # placeholder color seed — swap for real branding
    utils/                   # phone number → E.164 normalizer
  features/
    auth/                    # phone + OTP — real /auth/otp/* calls
    requests/                # the customer product: new request form, my requests, request details
    chat/                    # conversation + conversation list (both sides)
    dealer/                  # request inbox (the dealer's whole app), dealer registration
    legal/                   # fetches privacy policy / terms of use from the backend
    profile/                 # account tab
  shared/
    models/                  # PartRequest.fromJson
    widgets/                 # bottom-nav shell
```

## Wired to the real backend

Every screen calls its real endpoint via `ApiClient`
(`core/api/api_client.dart`, a Dio wrapper that attaches the saved JWT and
handles session expiry globally — see below): OTP request/verify; the
request form (`GET /catalog/vehicles/makes`, `GET /catalog/vehicles/models`,
`GET /catalog/canonical-parts` for suggestions, then `POST /requests`, with
the optional photo uploaded first through `MediaUploadService`); "طلباتي"
(`GET /requests/mine`, `GET /requests/:id`, `PATCH /requests/:id/close`);
the dealer inbox (`GET /requests/inbox`, `POST /requests/:id/answer`); chat
(`/conversations/**`, with `GET /conversations/dealer` for the dealer's
list); push-token registration (`PATCH /notifications/push-token`); dealer
registration (`POST /dealers/register`); account logout; and both legal
documents.

The request form degrades rather than blocking: if the catalog calls fail,
the screen still renders and the customer can still describe the part — a
catalog outage must never stop someone asking for a part.

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

**Location was removed with the pivot.** The old app used device GPS for
distance badges and "الأقرب" sorting; nothing in the new one shows or
sorts by distance, so `geolocator`, the location helper, and the
`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` + `NSLocationWhenInUse`
entries were all removed rather than left in place — an app that asks for
location it never uses is a store-review problem. If distance to each
answering dealer is wanted later, `Dealer.lat`/`lng` are still in the
schema and the haversine helper is still in the backend.

**Platform permission entries are already in place**, not just documented:
`android/app/src/main/AndroidManifest.xml` has
`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`, and `ios/Runner/Info.plist`
has `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` for
`image_picker` (the optional photo on a request, and images in chat), which
iOS requires or it terminates the app outright the first time a screen
opens the camera/gallery, rather than just failing that one call.
None of these existed before `flutter create .` ran; all three were added
by hand afterward, in the actual generated files.

## Getting an installable APK

The Android SDK isn't reachable from the environment this was developed
in (`dl.google.com` is outside its network policy), so the APK is built
in CI instead — GitHub's runners have the SDK preinstalled.

**To get one:** repository → **Actions** → **Build Android APK** → **Run
workflow**. It asks for the backend URL, because `API_BASE_URL` is baked
in at build time — an APK is only useful once it names a server that
exists. When the run finishes, the APK is at the bottom of the run page
under **Artifacts → qitaati-apk**.

The workflow runs `flutter analyze` and `flutter test` before building,
so a broken commit produces no APK rather than a broken one.

It's signed with the debug key (see `android/app/build.gradle.kts`),
which is exactly what makes it installable by sideloading — right for
handing testers a file. A Play Store upload needs a real release key
generated and kept by you; that's a separate step, and deliberately not
automated here since the key must not live in the repo.

## App identity

```
Application ID / bundle id:  sa.qitaati.app
Display name:                قطعتي
```

Set in `android/app/build.gradle.kts` (`namespace` + `applicationId`),
`android/app/src/main/AndroidManifest.xml` (`android:label`),
`ios/Runner.xcodeproj/project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER`) and
`ios/Runner/Info.plist` (`CFBundleDisplayName`). These replaced the
`com.example.carparts_app` default, which Google Play rejects outright.
It has to match the app registered in Firebase, so changing it now means
re-registering there — and after a store release, it's a different app
entirely.

## Enabling push notifications

The client half is wired (`core/push/push_service.dart`): on login, and
on app start when a session already exists, the device's FCM token is
sent to `PATCH /notifications/push-token`, and re-sent whenever FCM
rotates it. Until a Firebase project exists, `Firebase.initializeApp()`
fails, the failure is swallowed, and the app runs exactly as before —
in-app notifications still work, only the device wake-up is skipped.

To turn it on:

1. Create a Firebase project and register an Android app with
   **`sa.qitaati.app`** (and an iOS app with the same id).
2. Drop `google-services.json` into `android/app/`, and
   `GoogleService-Info.plist` into `ios/Runner/`.
3. Add the Google Services Gradle plugin — deliberately **not** committed,
   because it fails the build outright when the JSON isn't there, which
   would block every checkout that hasn't set Firebase up yet:
   ```kotlin
   // android/settings.gradle.kts — in the plugins { } block
   id("com.google.gms.google-services") version "4.4.2" apply false

   // android/app/build.gradle.kts — in the plugins { } block
   id("com.google.gms.google-services")
   ```
4. Set `PUSH_PROVIDER=fcm` plus the `FCM_*` service-account values on the
   backend (see `backend/README.md`).

Only foreground and system-tray delivery are wired. A background
`onBackgroundMessage` isolate is only needed for data-only messages; the
backend sends a `notification` payload, which the OS displays on its own
while the app is backgrounded.

## Known gaps in what's wired

- **No fine-grained dealer-staff permissions** — any authenticated user can
  currently create a listing under a `dealerId` in a way that isn't
  actually checked against their own dealer profile (see the `// NOTE`
  comments in `listings.controller.ts`/`search-requests.controller.ts` on
  the backend).
- Push notifications — the code path is complete end to end, but nothing
  has been sent to a real device: that needs the client's Firebase
  project (see "Enabling push notifications" above).
- App icon, splash screen, real branding/colors (placeholder seed color in
  `core/theme/app_theme.dart`).
- English localization (intentionally deferred — see the note in `main.dart`).
