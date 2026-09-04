import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/models/listing.dart';

/// Spec section 20. Backed by GET /inventory/listings/:id
/// (backend/src/modules/inventory/listings.controller.ts) — same response
/// shape as search results minus distanceKm, so Listing.fromJson handles
/// both.
class PartDetailsScreen extends ConsumerStatefulWidget {
  const PartDetailsScreen({super.key, required this.listingId});

  final String listingId;

  @override
  ConsumerState<PartDetailsScreen> createState() => _PartDetailsScreenState();
}

class _PartDetailsScreenState extends ConsumerState<PartDetailsScreen> {
  late Future<Listing> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<Listing> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/inventory/listings/${widget.listingId}');
    return Listing.fromJson(response.data as Map<String, dynamic>);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Listing>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return Scaffold(
            appBar: AppBar(title: const Text('تفاصيل القطعة')),
            body: const Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.hasError || !snapshot.hasData) {
          return Scaffold(
            appBar: AppBar(title: const Text('تفاصيل القطعة')),
            body: const Center(child: Text('تعذّر تحميل تفاصيل القطعة.')),
          );
        }
        return _PartDetailsBody(listing: snapshot.data!);
      },
    );
  }
}

class _PartDetailsBody extends StatelessWidget {
  const _PartDetailsBody({required this.listing});
  final Listing listing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(listing.partNameAr)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AspectRatio(
            aspectRatio: 4 / 3,
            child: Container(
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(16),
              ),
              child: listing.imageUrl != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.network(listing.imageUrl!, fit: BoxFit.cover),
                    )
                  : const Center(child: Icon(Icons.directions_car_filled_outlined, size: 56)),
            ),
          ),
          const SizedBox(height: 16),
          Text(listing.partNameAr, style: theme.textTheme.titleLarge),
          Text(listing.vehicleLabel, style: theme.textTheme.bodyMedium),
          Text('${listing.price} ريال', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              Chip(label: Text('الحالة: ${listing.condition}')),
              if (listing.updatedLabel != null) Chip(label: Text('آخر تحديث: ${listing.updatedLabel}')),
            ],
          ),
          const Divider(height: 32),
          ListTile(
            leading: const Icon(Icons.storefront_outlined),
            title: Text(listing.dealerName),
            subtitle: Row(
              children: [
                const Icon(Icons.star, size: 14, color: Colors.amber),
                Text(' ${listing.dealerRating}'),
                if (listing.distanceKm != null) Text('  ·  ${listing.distanceKm!.toStringAsFixed(0)} كم'),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => context
                      .push('/chat/new?listingId=${listing.id}&dealerId=${listing.dealerId}'),
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('تواصل مع التاجر'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
