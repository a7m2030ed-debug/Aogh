import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Spec section 11. Same app, dealer-side entry point — a real build needs
/// a role check (User.role == DEALER_OWNER/STAFF) to route here instead of
/// the customer HomeScreen; left as a TODO since the auth flow doesn't
/// carry role into the client yet.
class DealerDashboardScreen extends StatelessWidget {
  const DealerDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('لوحة التاجر')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/dealer/add-listing'),
        icon: const Icon(Icons.add),
        label: const Text('إضافة قطعة'),
      ),
      body: GridView.count(
        padding: const EdgeInsets.all(16),
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.4,
        children: const [
          _StatCard(label: 'طلبات جديدة', value: '12'),
          _StatCard(label: 'محادثات', value: '5'),
          _StatCard(label: 'قطع متوفرة', value: '850'),
          _StatCard(label: 'قطع مباعة', value: '27'),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(value, style: theme.textTheme.headlineMedium),
            Text(label, style: theme.textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
