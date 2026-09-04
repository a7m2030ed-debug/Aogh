import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/location/device_location.dart';
import '../../shared/models/listing.dart';
import '../../shared/widgets/listing_card.dart';

/// Spec sections 18-19. The review recommends shipping only four filters
/// in v1 (price, distance, condition, newest) instead of the full list —
/// that's a UI decision, so the filter row below only surfaces those four
/// even though the backend's SearchListingsDto already models more. Three
/// of the four map directly onto SearchSort (cheapest/nearest/newest) and
/// are wired as single-select chips here; "الحالة" needs a value picker
/// (which condition?) rather than a single tap, so it stays a TODO.
class SearchResultsScreen extends ConsumerStatefulWidget {
  const SearchResultsScreen({super.key, required this.query});

  final String query;

  @override
  ConsumerState<SearchResultsScreen> createState() => _SearchResultsScreenState();
}

class _SearchResultsScreenState extends ConsumerState<SearchResultsScreen> {
  late Future<Position?> _positionFuture;
  late Future<List<Listing>> _future;
  String? _sort;

  @override
  void initState() {
    super.initState();
    _positionFuture = tryGetCurrentPosition();
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
    final position = await _positionFuture;
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/inventory/search', queryParameters: {
      if (widget.query.isNotEmpty) 'q': widget.query,
      if (_sort != null) 'sort': _sort,
      if (position != null) 'lat': position.latitude,
      if (position != null) 'lng': position.longitude,
    });
    return (response.data as List).map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }

  void _setSort(String? sort) {
    setState(() {
      _sort = sort;
      _future = _fetch();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.query.isEmpty ? 'نتائج البحث' : widget.query)),
      body: Column(
        children: [
          _FilterRow(sort: _sort, onSortChanged: _setSort),
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
  const _FilterRow({required this.sort, required this.onSortChanged});

  final String? sort;
  final ValueChanged<String?> onSortChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        children: [
          ActionChip(label: const Text('الحالة'), onPressed: () {}), // TODO: condition-value picker
          const SizedBox(width: 8),
          _SortChip(label: 'الأرخص', value: 'cheapest', current: sort, onChanged: onSortChanged),
          const SizedBox(width: 8),
          _SortChip(label: 'الأقرب', value: 'nearest', current: sort, onChanged: onSortChanged),
          const SizedBox(width: 8),
          _SortChip(label: 'الأحدث', value: 'newest', current: sort, onChanged: onSortChanged),
        ],
      ),
    );
  }
}

class _SortChip extends StatelessWidget {
  const _SortChip({required this.label, required this.value, required this.current, required this.onChanged});

  final String label;
  final String value;
  final String? current;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final selected = current == value;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onChanged(selected ? null : value),
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
      // A 401 here already triggered ApiClient's global redirect to
      // /login (core/api/api_client.dart) — nothing left to do for it.
      if (!mounted || e.response?.statusCode == 401) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر إرسال الطلب. حاول مرة أخرى.')));
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
