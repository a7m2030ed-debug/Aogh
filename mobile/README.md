# Mobile app (Flutter)

Customer + dealer app for the used-car-parts marketplace. Arabic-first, RTL
by default (spec section 43).

## Status

This is a **code skeleton**, written without the Flutter SDK available in
the environment that created it, so it has **not** been run through
`flutter pub get` / `flutter analyze` / `flutter run`. The Dart code follows
standard, current APIs for the packages in `pubspec.yaml`, but treat it as
unverified until the steps below are run once.

The `android/`, `ios/`, `web/` platform folders are intentionally not
included — they're generated, not hand-written. Set them up once:

```bash
cd mobile
flutter create --project-name carparts_app --org com.example .   # adds android/, ios/, web/ around the existing lib/
flutter pub get
flutter analyze                                                   # fix whatever the real SDK flags
flutter run
```

## What's here

```
lib/
  main.dart                 # MaterialApp.router, RTL wrapper, theme
  core/
    api/                     # Dio client + JWT token storage
    config/                  # API base URL
    router/                  # go_router: shell (5 tabs) + pushed routes
    theme/                   # placeholder color seed — swap for real branding
  features/
    auth/                    # phone + OTP (spec section 4)
    search/                  # home, text search results, image search (6-10, 18-19, 31)
    catalog/                 # part details (20)
    chat/                    # conversation + negotiation strip (21-23), messages list
    orders/                  # my orders (33-34)
    dealer/                  # dashboard, add-listing (11-14), dealer registration (5)
    profile/                 # account tab (44)
  shared/
    models/                  # Listing model + mock data used until screens are wired to the API
    widgets/                 # ListingCard, bottom-nav shell
```

Screens render against `shared/models/listing.dart`'s mock data. Every
place a real backend call belongs has a `// TODO:` naming the exact
endpoint (see `../backend`) — wiring those up is the natural next step,
not a redesign.

## Still missing before this is a finished app

- Real API integration (the TODOs above).
- Push notifications (spec section 32) — no FCM/APNs setup yet.
- Maps SDK for location picking and distance display (section 25).
- App icon, splash screen, real branding/colors (placeholder seed color in `core/theme/app_theme.dart`).
- English localization (intentionally deferred — see the note in `main.dart`).
