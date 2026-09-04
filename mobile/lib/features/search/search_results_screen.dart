import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../shared/models/listing.dart';
import '../../shared/widgets/listing_card.dart';

/// Spec sections 18-19. The review recommends shipping only four filters
/// in v1 (price, distance, condition, newest) instead of the full list —
/// that's a UI decision, so the filter row below only surfaces those four
/// even though the backend's SearchListingsDto already models more.
class SearchResultsScreen extends StatelessWidget {
  const SearchResultsScreen({super.key, required this.query});

  final String query;

  @override
  Widget build(BuildContext context) {
    final results = mockListings; // TODO: GET /inventory/search?q=...
    return Scaffold(
      appBar: AppBar(title: Text(query.isEmpty ? 'نتائج البحث' : query)),
      body: Column(
        children: [
          const _FilterRow(),
          Expanded(
            child: results.isEmpty
                ? _NoResults(query: query)
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: results.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, i) => ListingCard(
                      listing: results[i],
                      onTap: () => context.push('/part/${results[i].id}'),
                    ),
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
class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});
  final String query;

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
            FilledButton(
              onPressed: () {}, // TODO: POST /inventory/search-requests
              child: const Text('ابحث لي عنها'),
            ),
          ],
        ),
      ),
    );
  }
}
