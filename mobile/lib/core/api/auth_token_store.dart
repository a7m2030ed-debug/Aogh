import 'package:shared_preferences/shared_preferences.dart';

/// Wraps the one piece of state every API call needs: the JWT issued by
/// POST /auth/otp/verify. Kept separate from ApiClient so widgets/tests can
/// read or clear the token without touching Dio.
class AuthTokenStore {
  static const _key = 'auth_token';

  Future<String?> read() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_key);
  }

  Future<void> save(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, token);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
