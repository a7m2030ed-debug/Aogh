import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/models/part_request.dart';

/// One request and the dealers who said they have the part. Tapping a
/// dealer opens the thread with them — that hand-off is where the app's
/// job ends.
class RequestDetailsScreen extends ConsumerStatefulWidget {
  const RequestDetailsScreen({super.key, required this.requestId});

  final String requestId;

  @override
  ConsumerState<RequestDetailsScreen> createState() => _RequestDetailsScreenState();
}

class _RequestDetailsScreenState extends ConsumerState<RequestDetailsScreen> {
  late Future<PartRequest> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<PartRequest> _fetch() async {
    final response =
        await ref.read(apiClientProvider).dio.get('/requests/${widget.requestId}');
    return PartRequest.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> _close() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('إغلاق الطلب'),
        content: const Text('ما راح يوصل الطلب لتجّار جدد بعد الإغلاق. محادثاتك الحالية تبقى.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('رجوع'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('إغلاق الطلب'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      await ref
          .read(apiClientProvider)
          .dio
          .patch('/requests/${widget.requestId}/close');
      if (!mounted) return;
      setState(() => _future = _fetch());
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر إغلاق الطلب.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تفاصيل الطلب')),
      body: FutureBuilder<PartRequest>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('تعذّر تحميل الطلب.'),
              ),
            );
          }

          final request = snapshot.data!;
          final theme = Theme.of(context);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(request.partName, style: theme.textTheme.titleLarge),
                      const SizedBox(height: 6),
                      Text(request.vehicleLabel, style: theme.textTheme.bodyLarge),
                      if (request.photoUrl != null) ...[
                        const SizedBox(height: 14),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.network(
                            request.photoUrl!,
                            height: 180,
                            width: double.infinity,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                request.answers.isEmpty ? 'لا توجد ردود بعد' : 'التجّار اللي ردّوا',
                style: theme.textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (request.answers.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: Text(
                    'وصل طلبك للتجّار. بننبّهك أول ما يرد أحد إن القطعة عنده.',
                    style: theme.textTheme.bodyMedium,
                  ),
                )
              else
                ...request.answers.map(
                  (answer) => Card(
                    child: ListTile(
                      title: Text(answer.dealerName),
                      subtitle: answer.city == null ? null : Text(answer.city!),
                      trailing: const Icon(Icons.chat_bubble_outline),
                      onTap: () => context.push('/chat/${answer.conversationId}'),
                    ),
                  ),
                ),
              if (request.isOpen) ...[
                const SizedBox(height: 24),
                OutlinedButton(
                  onPressed: _close,
                  child: const Text('لقيت القطعة — أغلق الطلب'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
