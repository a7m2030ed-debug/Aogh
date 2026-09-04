import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../shared/models/listing.dart';
import '../../shared/widgets/listing_card.dart';

/// Spec section 6: "الصفحة الرئيسية للعميل — يجب أن تكون بسيطة جدًا".
/// Search bar + image search up top, then the five result rails the spec
/// calls for. All sections here read from mockListings until search.service
/// endpoints are wired in.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('قطع غيار')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SearchBar(
            onSubmitted: (query) => context.push('/search?q=$query'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => context.push('/search/image'),
            icon: const Icon(Icons.camera_alt_outlined),
            label: const Text('البحث بالصورة'),
          ),
          const SizedBox(height: 24),
          const _SectionHeader('قطع متوفرة الآن'),
          ...mockListings.map(
            (l) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: ListingCard(listing: l, onTap: () => context.push('/part/${l.id}')),
            ),
          ),
          const SizedBox(height: 8),
          const _SectionHeader('تشاليح قريبة'),
          const _PlaceholderRow(),
          const SizedBox(height: 8),
          const _SectionHeader('أفضل التشاليح تقييمًا'),
          const _PlaceholderRow(),
        ],
      ),
    );
  }
}

class _SearchBar extends StatefulWidget {
  const _SearchBar({required this.onSubmitted});
  final ValueChanged<String> onSubmitted;

  @override
  State<_SearchBar> createState() => _SearchBarState();
}

class _SearchBarState extends State<_SearchBar> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      textInputAction: TextInputAction.search,
      onSubmitted: widget.onSubmitted,
      decoration: InputDecoration(
        hintText: 'مثال: صدام كامري 2022',
        prefixIcon: const Icon(Icons.search),
        suffixIcon: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => widget.onSubmitted(_controller.text),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(title, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

class _PlaceholderRow extends StatelessWidget {
  const _PlaceholderRow();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 90,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        'يُعبَّأ من نفس مصدر بيانات البحث لاحقًا',
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}
