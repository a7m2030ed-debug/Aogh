import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../api/api_client.dart';

/// Client half of the push pipeline whose server half lives in
/// backend/src/modules/notifications. The device registers its FCM token
/// with `PATCH /notifications/push-token`; the backend then wakes the
/// device on the events it already creates in-app notifications for
/// (negotiation agreed, order status changed — spec section 32).
///
/// Every entry point here is best-effort and never throws into the caller.
/// Firebase is only configured once the client creates their own project
/// and drops `google-services.json` / `GoogleService-Info.plist` in (see
/// mobile/README.md) — until then `Firebase.initializeApp()` fails, push
/// stays off, and the app keeps working exactly as before: the in-app
/// notification list is written by the backend either way, only the
/// device wake-up is skipped. This mirrors how the backend defaults to
/// its no-op push provider.
class PushService {
  PushService._();

  static final PushService instance = PushService._();

  bool _available = false;

  /// Attempts Firebase init. Safe to call when nothing is configured.
  Future<void> init() async {
    try {
      await Firebase.initializeApp();
      _available = true;
    } catch (error) {
      _available = false;
      debugPrint('Push disabled — Firebase not configured ($error)');
    }
  }

  /// Sends this device's token to the backend, and keeps sending it when
  /// FCM rotates it. Requires an authenticated session: the endpoint is
  /// behind the JWT guard, so call this after login (and on app start when
  /// a session already exists), never before.
  Future<void> syncToken(ApiClient apiClient) async {
    if (!_available) return;
    try {
      final messaging = FirebaseMessaging.instance;

      // iOS shows the system prompt here; Android 13+ needs the runtime
      // POST_NOTIFICATIONS grant, which this also drives. A denial is a
      // normal outcome, not an error — the user simply gets no pushes.
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;

      final token = await messaging.getToken();
      if (token != null) await _send(apiClient, token);

      // A rotated token silently breaks push until it's re-registered.
      _refreshSubscription ??=
          messaging.onTokenRefresh.listen((next) => _send(apiClient, next));
    } catch (error) {
      debugPrint('Push token sync skipped ($error)');
    }
  }

  StreamSubscription<String>? _refreshSubscription;

  Future<void> _send(ApiClient apiClient, String token) async {
    try {
      await apiClient.dio.patch('/notifications/push-token', data: {'token': token});
    } catch (error) {
      // A failed registration must never surface to the user mid-login.
      debugPrint('Push token registration failed ($error)');
    }
  }
}
