import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Spec section 44: "حسابي" tab.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
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
            onTap: () => context.go('/login'), // TODO: clear AuthTokenStore
          ),
        ],
      ),
    );
  }
}
