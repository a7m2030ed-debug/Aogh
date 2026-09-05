import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';

class _ConversationPreview {
  const _ConversationPreview({
    required this.id,
    required this.title,
    this.lastMessage,
    this.requestLabel,
  });

  /// `dealerSide` flips whose name heads the row: the customer sees the
  /// dealer's business name, the dealer sees the customer.
  factory _ConversationPreview.fromJson(Map<String, dynamic> json, {required bool dealerSide}) {
    final messages = json['messages'] as List?;
    final request = json['partRequest'] as Map<String, dynamic>?;

    String? counterparty;
    if (dealerSide) {
      final customer = json['user'] as Map<String, dynamic>?;
      // Customers often haven't set a name; the phone is the fallback
      // label the dealer can actually act on.
      counterparty = (customer?['name'] as String?) ?? (customer?['phone'] as String?);
    } else {
      counterparty = (json['dealer'] as Map<String, dynamic>?)?['businessName'] as String?;
    }

    final partName = request?['partName'] as String?;
    final make = request?['vehicleMake'] as String?;
    final model = request?['vehicleModel'] as String?;

    return _ConversationPreview(
      id: json['id'] as String,
      title: (counterparty?.isNotEmpty ?? false) ? counterparty! : 'محادثة',
      lastMessage: (messages != null && messages.isNotEmpty)
          ? messages.first['text'] as String?
          : null,
      requestLabel: partName == null ? null : '$partName — ${make ?? ''} ${model ?? ''}'.trim(),
    );
  }

  final String id;
  final String title;
  final String? lastMessage;
  final String? requestLabel;
}

/// Conversation list. Same screen both sides: customers hit
/// GET /conversations, dealers GET /conversations/dealer.
class MessagesListScreen extends ConsumerStatefulWidget {
  const MessagesListScreen({super.key, this.dealerSide = false});

  final bool dealerSide;

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
    final path = widget.dealerSide ? '/conversations/dealer' : '/conversations';
    final response = await ref.read(apiClientProvider).dio.get(path);
    return (response.data as List)
        .map((e) => _ConversationPreview.fromJson(
              e as Map<String, dynamic>,
              dealerSide: widget.dealerSide,
            ))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('الرسائل')),
      body: RefreshIndicator(
        onRefresh: () async {
          final future = _fetch();
          setState(() => _future = future);
          await future;
        },
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
                    child: Text('تعذّر تحميل المحادثات. اسحب للأسفل لإعادة المحاولة.'),
                  ),
                ],
              );
            }
            final conversations = snapshot.data ?? const <_ConversationPreview>[];
            if (conversations.isEmpty) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      widget.dealerSide
                          ? 'ما فيه محادثات بعد. رد على طلب عميل وتبدأ المحادثة.'
                          : 'ما فيه محادثات بعد. أول ما يرد تاجر على طلبك بتلقى محادثته هنا.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
                ],
              );
            }
            return ListView.builder(
              itemCount: conversations.length,
              itemBuilder: (context, i) {
                final conversation = conversations[i];
                return ListTile(
                  leading: CircleAvatar(
                    child: Icon(widget.dealerSide
                        ? Icons.person_outline
                        : Icons.storefront_outlined),
                  ),
                  title: Text(conversation.title),
                  subtitle: Text(
                    conversation.lastMessage ??
                        conversation.requestLabel ??
                        'لا توجد رسائل بعد',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  onTap: () => context.push('/chat/${conversation.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
