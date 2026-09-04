import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/models/listing.dart';
import '../../shared/widgets/listing_card.dart';

/// Spec section 6: "الصفحة الرئيسية للعميل — يجب أن تكون بسيطة جدًا".
/// Search bar + image search up top, then the "قطع متوفرة الآن" rail
/// backed by a plain (no query) GET /inventory/search. The other two
/// rails (nearby dealers, top-rated dealers) need dealer-level list
/// endpoints the backend doesn't have yet — still placeholders.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late Future<List<Listing>> _availableNow;

  @override
  void initState() {
    super.initState();
    _availableNow = _fetchAvailableNow();
  }

  Future<List<Listing>> _fetchAvailableNow() async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/inventory/search');
    return (response.data as List).map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('قطعتي')),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _availableNow = _fetchAvailableNow()),
        child: ListView(
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
            FutureBuilder<List<Listing>>(
              future: _availableNow,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (snapshot.hasError) {
                  return const _PlaceholderRow(text: 'تعذّر تحميل القطع. اسحب للأسفل لإعادة المحاولة.');
                }
                final results = snapshot.data ?? const <Listing>[];
                if (results.isEmpty) {
                  return const _PlaceholderRow(text: 'لا توجد قطع منشورة بعد.');
                }
                return Column(
                  children: results
                      .map((l) => Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: ListingCard(listing: l, onTap: () => context.push('/part/${l.id}')),
                          ))
                      .toList(),
                );
              },
            ),
            const SizedBox(height: 8),
            const _SectionHeader('تشاليح قريبة'),
            const _PlaceholderRow(text: 'يحتاج نقطة نهاية لقائمة التجار — لم تُبنَ بعد'),
            const SizedBox(height: 8),
            const _SectionHeader('أفضل التشاليح تقييمًا'),
            const _PlaceholderRow(text: 'يحتاج نقطة نهاية لقائمة التجار — لم تُبنَ بعد'),
          ],
        ),
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
  const _PlaceholderRow({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 90,
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}
