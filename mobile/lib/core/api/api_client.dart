import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/app_config.dart';
import 'auth_token_store.dart';

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
