/// Mirrors the shape returned by GET /inventory/search and
/// GET /inventory/listings/:id on the backend (see
/// backend/src/modules/inventory/search.service.ts). Kept intentionally
/// flat for the UI layer; a fromJson factory is the natural next step once
/// screens are wired to the real API instead of mock data.
class Listing {
  const Listing({
    required this.id,
    required this.dealerId,
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
  final String dealerId;
  final String partNameAr;
  final String vehicleLabel;
  final num price;
  final String condition;
  final String dealerName;
  final double dealerRating;
  final double? distanceKm;
  final String? imageUrl;
  final String? updatedLabel;

  /// Maps the actual shape returned by GET /inventory/search and
  /// GET /inventory/listings/:id — a Prisma InventoryListing row with
  /// `dealer`, `canonicalPart`, `images`, `vehicleModel` included, plus a
  /// computed `distanceKm` (see backend/src/modules/inventory/search.service.ts).
  /// `price` arrives as a string (Prisma Decimal serializes that way), not
  /// a JSON number — num.parse handles it either way.
  factory Listing.fromJson(Map<String, dynamic> json) {
    final canonicalPart = json['canonicalPart'] as Map<String, dynamic>?;
    final dealer = json['dealer'] as Map<String, dynamic>?;
    final vehicleModel = json['vehicleModel'] as Map<String, dynamic>?;
    final images = json['images'] as List<dynamic>?;
    final vehicleYear = json['vehicleYear'];

    final vehicleLabel = [
      if (vehicleModel != null) vehicleModel['nameEn'] as String?,
      if (vehicleYear != null) vehicleYear.toString(),
    ].join(' ').trim();

    return Listing(
      id: json['id'] as String,
      dealerId: json['dealerId'] as String,
      partNameAr: canonicalPart?['canonicalNameAr'] as String? ?? '',
      vehicleLabel: vehicleLabel,
      price: num.parse(json['price'].toString()),
      condition: conditionLabelAr(json['condition'] as String? ?? ''),
      dealerName: dealer?['businessName'] as String? ?? '',
      dealerRating: (dealer?['ratingAverage'] as num?)?.toDouble() ?? 0,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      imageUrl: (images != null && images.isNotEmpty) ? images.first['url'] as String? : null,
    );
  }
}

/// Backend enum values (InventoryListing.condition) → the Arabic labels
/// used throughout the spec (section 13).
String conditionLabelAr(String value) => switch (value) {
      'EXCELLENT' => 'ممتازة',
      'GOOD' => 'جيدة',
      'ACCEPTABLE' => 'مقبولة',
      'NEEDS_REPAIR' => 'تحتاج إصلاح',
      _ => value,
    };
