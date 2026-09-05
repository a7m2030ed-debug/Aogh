import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/models/part_request.dart';

/// The dealer's whole app: incoming customer requests, newest first
/// (GET /requests/inbox). "عندي هذي القطعة" opens a conversation with the
/// customer (POST /requests/:id/answer) and the dealer takes it from there.
class DealerDashboardScreen extends ConsumerStatefulWidget {
  const DealerDashboardScreen({super.key});

  @override
  ConsumerState<DealerDashboardScreen> createState() => _DealerDashboardScreenState();
}

class _DealerDashboardScreenState extends ConsumerState<DealerDashboardScreen> {
  late Future<List<PartRequest>> _future;
  final _answering = <String>{};

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<List<PartRequest>> _fetch() async {
    final response = await ref.read(apiClientProvider).dio.get('/requests/inbox');
    return (response.data as List)
        .map((e) => PartRequest.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> _refresh() async {
    final future = _fetch();
    setState(() => _future = future);
    await future;
  }

  Future<void> _answer(PartRequest request) async {
    // Guard against a double tap opening two threads before the first
    // response lands (the backend is idempotent, but the UI shouldn't
    // fire twice either).
    if (_answering.contains(request.id)) return;
    setState(() => _answering.add(request.id));
    try {
      final response = await ref
          .read(apiClientProvider)
          .dio
          .post('/requests/${request.id}/answer', data: const {});
      if (!mounted) return;
      final conversationId = response.data['id'] as String;
      context.push('/chat/$conversationId');
      await _refresh();
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر فتح المحادثة. حاول مرة أخرى.')));
    } finally {
      if (mounted) setState(() => _answering.remove(request.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('طلبات العملاء'),
        actions: [
          IconButton(
            tooltip: 'محادثاتي',
            onPressed: () => context.push('/dealer/chats'),
            icon: const Icon(Icons.chat_bubble_outline),
          ),
          IconButton(
            tooltip: 'حسابي',
            onPressed: () => context.push('/profile-page'),
            icon: const Icon(Icons.person_outline),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<PartRequest>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return _Message(
                text: snapshot.error is DioException
                    ? 'تعذّر تحميل الطلبات. تأكد من أن حسابك مسجّل كتاجر ومن الاتصال بالخادم.'
                    : 'صار خطأ غير متوقع.',
              );
            }
            final requests = snapshot.data ?? const <PartRequest>[];
            if (requests.isEmpty) {
              return const _Message(text: 'ما فيه طلبات مفتوحة حاليًا.\nبيوصلك إشعار أول ما يطلب عميل قطعة.');
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: requests.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final request = requests[i];
                return _RequestCard(
                  request: request,
                  busy: _answering.contains(request.id),
                  onAnswer: () => _answer(request),
                  onOpenChat: request.myConversationId == null
                      ? null
                      : () => context.push('/chat/${request.myConversationId}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({
    required this.request,
    required this.busy,
    required this.onAnswer,
    required this.onOpenChat,
  });

  final PartRequest request;
  final bool busy;
  final VoidCallback onAnswer;
  final VoidCallback? onOpenChat;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final answered = onOpenChat != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(request.partName, style: theme.textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(request.vehicleLabel, style: theme.textTheme.bodyMedium),
            if (request.photoUrl != null) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.network(
                  request.photoUrl!,
                  height: 150,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            ],
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: answered
                  ? OutlinedButton.icon(
                      onPressed: onOpenChat,
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: const Text('ردّيت — افتح المحادثة'),
                    )
                  : FilledButton.icon(
                      onPressed: busy ? null : onAnswer,
                      icon: busy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.check),
                      label: const Text('عندي هذي القطعة'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(40),
      children: [
        Text(text, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
      ],
    );
  }
}
