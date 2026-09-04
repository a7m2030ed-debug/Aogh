import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../shared/models/listing.dart';

/// Spec section 20. Pulls from mockListings by id for now — real version
/// calls GET /inventory/listings/:id.
class PartDetailsScreen extends StatelessWidget {
  const PartDetailsScreen({super.key, required this.listingId});

  final String listingId;

  @override
  Widget build(BuildContext context) {
    final listing = mockListings.firstWhere(
      (l) => l.id == listingId,
      orElse: () => mockListings.first,
    );
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
              child: const Center(child: Icon(Icons.directions_car_filled_outlined, size: 56)),
            ),
          ),
          const SizedBox(height: 16),
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
                  onPressed: () => context.push('/chat/new?listingId=${listing.id}'),
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
