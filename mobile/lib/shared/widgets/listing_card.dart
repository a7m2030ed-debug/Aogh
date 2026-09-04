import 'package:flutter/material.dart';
import '../models/listing.dart';

/// The one card design reused on the home screen, search results (spec
/// section 18), and anywhere else a listing shows up in a list — image
/// first, per section 43 ("يعتمد على الصور").
class ListingCard extends StatelessWidget {
  const ListingCard({super.key, required this.listing, this.onTap});

  final Listing listing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 84,
                  height: 84,
                  color: theme.colorScheme.surfaceContainerHighest,
                  child: Icon(Icons.directions_car_filled_outlined,
                      color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(listing.partNameAr, style: theme.textTheme.titleMedium),
                    Text(listing.vehicleLabel, style: theme.textTheme.bodySmall),
                    const SizedBox(height: 6),
                    Text('${listing.price} ريال',
                        style: theme.textTheme.titleMedium
                            ?.copyWith(color: theme.colorScheme.primary)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        _Chip(text: listing.condition),
                        const SizedBox(width: 6),
                        Icon(Icons.star, size: 14, color: Colors.amber.shade700),
                        Text(' ${listing.dealerRating}', style: theme.textTheme.bodySmall),
                        if (listing.distanceKm != null) ...[
                          const SizedBox(width: 8),
                          Icon(Icons.location_on_outlined,
                              size: 14, color: theme.colorScheme.outline),
                          Text(' ${listing.distanceKm!.toStringAsFixed(0)} كم',
                              style: theme.textTheme.bodySmall),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text, style: theme.textTheme.labelSmall),
    );
  }
}
