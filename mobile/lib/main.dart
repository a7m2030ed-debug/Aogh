import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

void main() {
  runApp(const ProviderScope(child: CarPartsApp()));
}

/// Spec section 43: "عربي أولًا، يدعم الإنجليزية لاحقًا". The app locale is
/// hardcoded to Arabic/RTL for the MVP rather than wired through a full
/// intl/ARB localization setup — add flutter_localizations' delegates +
/// ARB files when English support actually gets scheduled (deferred to v2
/// per the review, section 6).
class CarPartsApp extends StatelessWidget {
  const CarPartsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'قطع غيار',
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
