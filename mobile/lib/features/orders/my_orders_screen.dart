import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';

/// Backend OrderStatus enum (prisma/schema.prisma) → the nine statuses
/// from spec section 34, plus CANCELLED which the schema adds for the
/// dropped/no-longer-pursued case the spec's list didn't name.
String _statusLabelAr(String status) => switch (status) {
      'CREATED' => 'تم إنشاء الطلب',
      'SEARCHING' => 'جاري البحث',
      'PART_FOUND' => 'تم العثور على القطعة',
      'OFFER_SELECTED' => 'تم اختيار العرض',
      'NEGOTIATING' => 'جاري التفاوض',
      'AGREED' => 'تم الاتفاق',
      'PICKUP_OR_DELIVERY' => 'استلام من التشليح / توصيل',
      'RECEIVED' => 'تم الاستلام',
      'CLOSED' => 'تم إغلاق الطلب',
      'CANCELLED' => 'ملغي',
      _ => status,
    };

class _OrderSummary {
  const _OrderSummary({
    required this.orderNumber,
    required this.statusLabel,
    required this.totalPrice,
    required this.dealerName,
    this.partNameAr,
  });

  factory _OrderSummary.fromJson(Map<String, dynamic> json) {
    final listing = json['listing'] as Map<String, dynamic>?;
    return _OrderSummary(
      orderNumber: json['orderNumber'] as int,
      statusLabel: _statusLabelAr(json['status'] as String),
      totalPrice: num.parse(json['totalPrice'].toString()),
      dealerName: (json['dealer'] as Map<String, dynamic>?)?['businessName'] as String? ?? '',
      partNameAr: (listing?['canonicalPart'] as Map<String, dynamic>?)?['canonicalNameAr'] as String?,
    );
  }

  final int orderNumber;
  final String statusLabel;
  final num totalPrice;
  final String dealerName;
  final String? partNameAr;
}

/// Spec sections 33-34. Backed by GET /orders
/// (backend/src/modules/orders/orders.controller.ts).
class MyOrdersScreen extends ConsumerStatefulWidget {
  const MyOrdersScreen({super.key});

  @override
  ConsumerState<MyOrdersScreen> createState() => _MyOrdersScreenState();
}

class _MyOrdersScreenState extends ConsumerState<MyOrdersScreen> {
  late Future<List<_OrderSummary>> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetch();
  }

  Future<List<_OrderSummary>> _fetch() async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/orders');
    return (response.data as List)
        .map((e) => _OrderSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _future = _fetch()),
        child: FutureBuilder<List<_OrderSummary>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(
                children: const [
                  Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('سجّل الدخول لعرض طلباتك، أو اسحب للأسفل لإعادة المحاولة.'),
                  ),
                ],
              );
            }
            final orders = snapshot.data ?? const <_OrderSummary>[];
            if (orders.isEmpty) {
              return ListView(
                children: const [
                  Padding(padding: EdgeInsets.all(24), child: Text('لا طلبات بعد.')),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: orders.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final order = orders[i];
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('طلب #${order.orderNumber}', style: Theme.of(context).textTheme.titleMedium),
                        if (order.partNameAr != null) Text(order.partNameAr!),
                        Text(order.dealerName, style: Theme.of(context).textTheme.bodySmall),
                        const SizedBox(height: 8),
                        Text('الحالة الحالية: ${order.statusLabel}'),
                        const SizedBox(height: 4),
                        Text('السعر: ${order.totalPrice} ريال',
                            style: Theme.of(context).textTheme.bodyMedium),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
