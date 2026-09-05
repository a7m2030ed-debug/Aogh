import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/models/part_request.dart';

/// "طلباتي" — GET /requests/mine. The count of dealers who answered is the
/// only status that matters here, so it's what the card leads with.
class MyRequestsScreen extends ConsumerStatefulWidget {
  const MyRequestsScreen({super.key});

  @override
  ConsumerState<MyRequestsScreen> createState() => _MyRequestsScreenState();
}

class _MyRequestsScreenState extends ConsumerState<MyRequestsScreen> {
  late Future<List<PartRequest>> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<List<PartRequest>> _fetch() async {
    final response = await ref.read(apiClientProvider).dio.get('/requests/mine');
    return (response.data as List)
        .map((e) => PartRequest.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> _refresh() async {
    final future = _fetch();
    setState(() => _future = future);
    await future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي')),
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
                    ? 'تعذّر تحميل طلباتك. تأكد من الاتصال بالخادم.'
                    : 'صار خطأ غير متوقع.',
              );
            }
            final requests = snapshot.data ?? const <PartRequest>[];
            if (requests.isEmpty) {
              return const _Message(
                text: 'ما عندك طلبات بعد.\nاكتب القطعة اللي تدور عليها من تبويب "اطلب قطعة".',
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: requests.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) => _RequestCard(request: requests[i]),
            );
          },
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request});

  final PartRequest request;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final answers = request.answers.length;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/requests/${request.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(request.partName, style: theme.textTheme.titleMedium),
                  ),
                  if (!request.isOpen)
                    const Chip(
                      label: Text('مغلق'),
                      visualDensity: VisualDensity.compact,
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(request.vehicleLabel, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(
                    answers > 0 ? Icons.mark_chat_read_outlined : Icons.hourglass_empty,
                    size: 18,
                    color: answers > 0 ? theme.colorScheme.primary : theme.colorScheme.outline,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    answers > 0 ? 'رد عليك $answers من التجّار' : 'بانتظار رد التجّار',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: answers > 0 ? theme.colorScheme.primary : theme.colorScheme.outline,
                    ),
                  ),
                ],
              ),
            ],
          ),
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
    // Inside a ListView so RefreshIndicator still has something to pull on.
    return ListView(
      padding: const EdgeInsets.all(40),
      children: [
        Text(text, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge),
      ],
    );
  }
}
