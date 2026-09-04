import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';

/// Spec section 44: "حسابي" tab.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('حسابي')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.storefront_outlined),
            title: const Text('التسجيل كتاجر / تشليح'),
            trailing: const Icon(Icons.chevron_left),
            onTap: () => context.push('/dealer/register'),
          ),
          ListTile(
            leading: const Icon(Icons.flag_outlined),
            title: const Text('البلاغات'),
            trailing: const Icon(Icons.chevron_left),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('تسجيل الخروج'),
            onTap: () async {
              await ref.read(authTokenStoreProvider).clear();
              if (context.mounted) context.go('/login');
            },
          ),
        ],
      ),
    );
  }
}
