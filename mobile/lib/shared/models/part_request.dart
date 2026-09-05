/// A dealer who answered a request — enough to show a card and open the
/// thread, which is all the app ever does with them.
class RequestAnswer {
  const RequestAnswer({
    required this.conversationId,
    required this.dealerName,
    this.city,
    this.dealerPhone,
  });

  final String conversationId;
  final String dealerName;
  final String? city;
  final String? dealerPhone;

  factory RequestAnswer.fromJson(Map<String, dynamic> json) {
    final dealer = json['dealer'] as Map<String, dynamic>? ?? const {};
    return RequestAnswer(
      conversationId: json['id'] as String,
      dealerName: dealer['businessName'] as String? ?? 'تاجر',
      city: dealer['city'] as String?,
      dealerPhone: dealer['contactPhone'] as String?,
    );
  }
}

/// Mirrors PartRequest in backend/prisma/schema.prisma — the three fields
/// the customer filled in, plus whoever has answered so far.
class PartRequest {
  const PartRequest({
    required this.id,
    required this.partName,
    required this.vehicleMake,
    required this.vehicleModel,
    required this.status,
    required this.createdAt,
    this.photoUrl,
    this.answers = const [],
    this.myConversationId,
  });

  final String id;
  final String partName;
  final String vehicleMake;
  final String vehicleModel;
  final String status;
  final DateTime createdAt;
  final String? photoUrl;

  /// Customer side: the dealers who said they have it.
  final List<RequestAnswer> answers;

  /// Dealer side: set when *this* dealer has already answered, so the feed
  /// shows "فتح المحادثة" instead of offering to answer twice.
  final String? myConversationId;

  bool get isOpen => status == 'OPEN';
  String get vehicleLabel => '$vehicleMake $vehicleModel';

  factory PartRequest.fromJson(Map<String, dynamic> json) => PartRequest(
        id: json['id'] as String,
        partName: json['partName'] as String? ?? '',
        vehicleMake: json['vehicleMake'] as String? ?? '',
        vehicleModel: json['vehicleModel'] as String? ?? '',
        status: json['status'] as String? ?? 'OPEN',
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
        photoUrl: json['photoUrl'] as String?,
        answers: (json['conversations'] as List? ?? const [])
            .map((e) => RequestAnswer.fromJson(e as Map<String, dynamic>))
            .toList(),
        myConversationId: json['myConversationId'] as String?,
      );
}
