import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';

class _ConversationPreview {
  const _ConversationPreview({required this.id, required this.dealerName, this.lastMessage, this.partNameAr});

  factory _ConversationPreview.fromJson(Map<String, dynamic> json) {
    final messages = json['messages'] as List?;
    final listing = json['listing'] as Map<String, dynamic>?;
    return _ConversationPreview(
      id: json['id'] as String,
      dealerName: (json['dealer'] as Map<String, dynamic>?)?['businessName'] as String? ?? '',
      lastMessage:
          (messages != null && messages.isNotEmpty) ? messages.first['text'] as String? : null,
      partNameAr: (listing?['canonicalPart'] as Map<String, dynamic>?)?['canonicalNameAr'] as String?,
    );
  }

  final String id;
  final String dealerName;
  final String? lastMessage;
  final String? partNameAr;
}

/// Landing screen for the "الرسائل" tab (section 44) — lists conversations
/// via GET /conversations (backend/src/modules/conversations, added
/// alongside my-orders' equivalent list-mine endpoint).
class MessagesListScreen extends ConsumerStatefulWidget {
  const MessagesListScreen({super.key});

  @override
  ConsumerState<MessagesListScreen> createState() => _MessagesListScreenState();
}

class _MessagesListScreenState extends ConsumerState<MessagesListScreen> {
  late Future<List<_ConversationPreview>> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<List<_ConversationPreview>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/conversations');
    return (response.data as List)
        .map((e) => _ConversationPreview.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الرسائل')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _fetch()),
        child: FutureBuilder<List<_ConversationPreview>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                children: const [
                  Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('سجّل الدخول لعرض محادثاتك، أو اسحب للأسفل لإعادة المحاولة.'),
                  ),
                ],
              );
            }
            final conversations = snapshot.data ?? const <_ConversationPreview>[];
            if (conversations.isEmpty) {
              return ListView(
                children: const [
                  Padding(padding: EdgeInsets.all(24), child: Text('لا توجد محادثات بعد.')),
                ],
              );
            }
            return ListView.builder(
              itemCount: conversations.length,
              itemBuilder: (context, i) {
                final c = conversations[i];
                return ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.storefront_outlined)),
                  title: Text(c.dealerName.isEmpty ? 'محادثة' : c.dealerName),
                  subtitle: Text(c.lastMessage ?? c.partNameAr ?? 'لا توجد رسائل بعد'),
                  onTap: () => context.push('/chat/${c.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
