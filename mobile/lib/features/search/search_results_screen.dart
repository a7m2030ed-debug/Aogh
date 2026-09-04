import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/models/listing.dart';
import '../../shared/widgets/listing_card.dart';

/// Spec sections 18-19. The review recommends shipping only four filters
/// in v1 (price, distance, condition, newest) instead of the full list —
/// that's a UI decision, so the filter row below only surfaces those four
/// even though the backend's SearchListingsDto already models more.
class SearchResultsScreen extends ConsumerStatefulWidget {
  const SearchResultsScreen({super.key, required this.query});

  final String query;

  @override
  ConsumerState<SearchResultsScreen> createState() => _SearchResultsScreenState();
}

class _SearchResultsScreenState extends ConsumerState<SearchResultsScreen> {
  late Future<List<Listing>> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  @override
  void didUpdateWidget(covariant SearchResultsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.query != widget.query) {
      setState(() => _future = _fetch());
    }
  }

  Future<List<Listing>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get(
      '/inventory/search',
      queryParameters: widget.query.isEmpty ? null : {'q': widget.query},
    );
    return (response.data as List).map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.query.isEmpty ? 'نتائج البحث' : widget.query)),
      body: Column(
        children: [
          const _FilterRow(),
          Expanded(
            child: FutureBuilder<List<Listing>>(
              future: _future,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text('تعذّر تحميل نتائج البحث. تأكد من الاتصال بالخادم.',
                          style: Theme.of(context).textTheme.bodyMedium),
                    ),
                  );
                }
                final results = snapshot.data ?? const <Listing>[];
                if (results.isEmpty) {
                  return _NoResults(query: widget.query);
                }
                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: results.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, i) => ListingCard(
                    listing: results[i],
                    onTap: () => context.push('/part/${results[i].id}'),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow();

  @override
  Widget build(BuildContext context) {
    const filters = ['السعر', 'المسافة', 'الحالة', 'الأحدث'];
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) => ActionChip(
          label: Text(filters[i]),
          onPressed: () {}, // TODO: open filter sheet, refine search query
        ),
      ),
    );
  }
}

/// Spec section 31: "لم نجد القطعة في المخزون الحالي" → "ابحث لي عنها".
/// The review promotes this from a fallback to a primary growth channel,
/// so it's a first-class screen state, not a generic empty-state message.
class _NoResults extends ConsumerStatefulWidget {
  const _NoResults({required this.query});
  final String query;

  @override
  ConsumerState<_NoResults> createState() => _NoResultsState();
}

class _NoResultsState extends ConsumerState<_NoResults> {
  bool _submitting = false;
  bool _submitted = false;

  Future<void> _requestSearch() async {
    setState(() => _submitting = true);
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post('/inventory/search-requests', data: {'freeText': widget.query});
      if (!mounted) return;
      setState(() => _submitted = true);
    } on DioException catch (e) {
      if (!mounted) return;
      if (e.response?.statusCode == 401) {
        context.push('/login');
      } else {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('تعذّر إرسال الطلب. حاول مرة أخرى.')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.search_off, size: 48),
            const SizedBox(height: 12),
            const Text('لم نجد القطعة في المخزون الحالي.'),
            const SizedBox(height: 16),
            if (_submitted)
              const Text('تم إرسال طلبك للتشاليح، سنخبرك عند توفر القطعة.')
            else
              FilledButton(
                onPressed: _submitting ? null : _requestSearch,
                child: _submitting
                    ? const SizedBox(
                        width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('ابحث لي عنها'),
              ),
          ],
        ),
      ),
    );
  }
}
