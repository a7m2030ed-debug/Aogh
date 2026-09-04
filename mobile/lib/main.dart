import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/api/api_client.dart';
import 'core/push/push_service.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // No-ops when the client hasn't set up their Firebase project yet — see
  // core/push/push_service.dart. Never blocks startup.
  await PushService.instance.init();
  runApp(const ProviderScope(child: CarPartsApp()));
}

/// Spec section 43: "عربي أولًا، يدعم الإنجليزية لاحقًا". The app locale is
/// hardcoded to Arabic/RTL for the MVP rather than wired through a full
/// intl/ARB localization setup — add flutter_localizations' delegates +
/// ARB files when English support actually gets scheduled (deferred to v2
/// per the review, section 6).
class CarPartsApp extends ConsumerStatefulWidget {
  const CarPartsApp({super.key});

  @override
  ConsumerState<CarPartsApp> createState() => _CarPartsAppState();
}

class _CarPartsAppState extends ConsumerState<CarPartsApp> {
  @override
  void initState() {
    super.initState();
    // Covers the "already logged in from a previous run" case; a fresh
    // login registers its own token in phone_otp_screen.dart. Both are
    // needed — FCM can rotate a token between runs.
    _syncPushTokenIfSignedIn();
  }

  Future<void> _syncPushTokenIfSignedIn() async {
    final token = await ref.read(authTokenStoreProvider).read();
    if (token == null) return;
    await PushService.instance.syncToken(ref.read(apiClientProvider));
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'قطعتي',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      routerConfig: appRouter,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
