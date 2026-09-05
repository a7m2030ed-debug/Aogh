import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

/// Who's signed in, from GET /users/me. Cached for the session because two
/// things need it constantly: which experience to show (customer vs
/// dealer), and which side of a chat "me" is on.
class CurrentUser {
  const CurrentUser({required this.id, required this.role, this.name, this.phone});

  final String id;
  final String role;
  final String? name;
  final String? phone;

  bool get isDealer => role == 'DEALER_OWNER' || role == 'DEALER_STAFF';

  factory CurrentUser.fromJson(Map<String, dynamic> json) => CurrentUser(
        id: json['id'] as String,
        role: json['role'] as String? ?? 'CUSTOMER',
        name: json['name'] as String?,
        phone: json['phone'] as String?,
      );
}

/// Invalidate this after login/logout so the next read refetches.
final currentUserProvider = FutureProvider<CurrentUser>((ref) async {
  final response = await ref.read(apiClientProvider).dio.get('/users/me');
  return CurrentUser.fromJson(response.data as Map<String, dynamic>);
});
