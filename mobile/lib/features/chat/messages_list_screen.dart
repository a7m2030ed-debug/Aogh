import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Landing screen for the "الرسائل" tab (section 44) — lists conversations,
/// each opening ConversationScreen. Backed by GET /conversations (a
/// list-mine endpoint the backend doesn't expose yet; only per-conversation
/// message reads exist today — add one when this is wired up for real).
class MessagesListScreen extends StatelessWidget {
  const MessagesListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الرسائل')),
      body: ListView(
        children: [
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.storefront_outlined)),
            title: const Text('تشليح فوزان'),
            subtitle: const Text('لا، فيها خدوش بسيطة.'),
            onTap: () => context.push('/chat/1'),
          ),
        ],
      ),
    );
  }
}
