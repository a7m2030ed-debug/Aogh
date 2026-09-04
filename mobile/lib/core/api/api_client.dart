import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/app_config.dart';
import '../router/navigator_key.dart';
import 'auth_token_store.dart';

// Requests to these paths get their own inline error handling in the
// screens that call them (wrong OTP code, wrong login password-equivalent)
// — a 401 there means "that code was wrong", not "your session expired",
// so the global redirect below must not also fire for them.
const _authEndpoints = ['/auth/otp/request', '/auth/otp/verify'];

/// Thin wrapper around the backend's one API gateway (backend/src/main.ts —
/// everything is mounted under /api/v1). Every feature module talks to the
/// backend through this one client rather than constructing its own Dio
/// instance, so auth headers and base URL changes happen in one place.
class ApiClient {
  ApiClient(this._tokenStore)
      : dio = Dio(BaseOptions(baseUrl: AppConfig.apiBaseUrl)) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStore.read();
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final path = error.requestOptions.path;
          final isAuthEndpoint = _authEndpoints.any((p) => path.contains(p));
          if (error.response?.statusCode == 401 && !isAuthEndpoint) {
            await _tokenStore.clear();
            final context = rootNavigatorKey.currentContext;
            // go() replaces the current location rather than pushing, so
            // calling it again while already on /login is a harmless no-op
            // — no need to check the current route first.
            if (context != null) GoRouter.of(context).go('/login');
          }
          handler.next(error);
        },
      ),
    );
  }

  final Dio dio;
  final AuthTokenStore _tokenStore;
}

final authTokenStoreProvider = Provider((ref) => AuthTokenStore());

final apiClientProvider = Provider((ref) {
  return ApiClient(ref.read(authTokenStoreProvider));
});
