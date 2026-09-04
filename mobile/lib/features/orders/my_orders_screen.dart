import 'package:flutter/material.dart';

/// Spec sections 33-34: every order has a number and moves through nine
/// statuses. This shows the status list as a simple stepper-style label
/// for now — real data comes from GET /orders (a list-mine endpoint the
/// backend doesn't have yet, only /orders/:id; add one when this screen
/// is wired up for real).
const _orderStatuses = [
  'تم إنشاء الطلب',
  'جاري البحث',
  'تم العثور على القطعة',
  'تم اختيار العرض',
  'جاري التفاوض',
  'تم الاتفاق',
  'استلام من التشليح / توصيل',
  'تم الاستلام',
  'تم إغلاق الطلب',
];

class MyOrdersScreen extends StatelessWidget {
  const MyOrdersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('طلب #10284', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text('الحالة الحالية: ${_orderStatuses[5]}'),
                  const SizedBox(height: 4),
                  Text('السعر: 360 ريال', style: Theme.of(context).textTheme.bodyMedium),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          Center(
            child: Text(
              'لا طلبات أخرى بعد',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}
