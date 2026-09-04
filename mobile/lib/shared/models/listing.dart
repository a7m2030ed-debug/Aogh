/// Mirrors the shape returned by GET /inventory/search and
/// GET /inventory/listings/:id on the backend (see
/// backend/src/modules/inventory/search.service.ts). Kept intentionally
/// flat for the UI layer; a fromJson factory is the natural next step once
/// screens are wired to the real API instead of mock data.
class Listing {
  const Listing({
    required this.id,
    required this.partNameAr,
    required this.vehicleLabel,
    required this.price,
    required this.condition,
    required this.dealerName,
    required this.dealerRating,
    this.distanceKm,
    this.imageUrl,
    this.updatedLabel,
  });

  final String id;
  final String partNameAr;
  final String vehicleLabel;
  final num price;
  final String condition;
  final String dealerName;
  final double dealerRating;
  final double? distanceKm;
  final String? imageUrl;
  final String? updatedLabel;
}

/// Placeholder data so every screen renders something meaningful before
/// the app is wired to the live backend. Matches the example listings used
/// throughout the spec (sections 15, 18) almost verbatim.
const mockListings = <Listing>[
  Listing(
    id: '1',
    partNameAr: 'صدام أمامي',
    vehicleLabel: 'Toyota Camry 2022',
    price: 350,
    condition: 'جيدة',
    dealerName: 'تشليح فوزان',
    dealerRating: 4.8,
    distanceKm: 18,
    updatedLabel: 'قبل 10 دقائق',
  ),
  Listing(
    id: '2',
    partNameAr: 'صدام أمامي',
    vehicleLabel: 'Toyota Camry 2022',
    price: 400,
    condition: 'ممتازة',
    dealerName: 'تشليح النخبة',
    dealerRating: 4.6,
    distanceKm: 24,
  ),
  Listing(
    id: '3',
    partNameAr: 'صدام أمامي',
    vehicleLabel: 'Toyota Camry 2022',
    price: 300,
    condition: 'مقبولة',
    dealerName: 'تشليح الرياض',
    dealerRating: 4.4,
    distanceKm: 31,
  ),
];
