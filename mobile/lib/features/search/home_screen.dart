import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../shared/models/listing.dart';
import '../../shared/widgets/listing_card.dart';

/// Spec section 6: "الصفحة الرئيسية للعميل — يجب أن تكون بسيطة جدًا".
/// Search bar + image search up top, then three rails, all backed by real
/// endpoints now: "قطع متوفرة الآن" (GET /inventory/search, no query),
/// "تشاليح قريبة" and "أفضل التشاليح تقييمًا" (GET /dealers?sort=nearest/rating
/// — backend/src/modules/identity/dealers.controller.ts). The "nearby" rail
/// doesn't yet pass the device's lat/lng, so it currently returns the same
/// verified-dealers list as an unsorted fallback rather than true distance
/// order — wiring `geolocator` (already in pubspec.yaml for exactly this)
/// plus the location permission entries `flutter create .` doesn't add on
/// its own is the remaining step.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _DealerPreview {
  const _DealerPreview({required this.businessName, required this.city, required this.ratingAverage});

  factory _DealerPreview.fromJson(Map<String, dynamic> json) => _DealerPreview(
        businessName: json['businessName'] as String,
        city: json['city'] as String,
        ratingAverage: (json['ratingAverage'] as num).toDouble(),
      );

  final String businessName;
  final String city;
  final double ratingAverage;
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late Future<List<Listing>> _availableNow;
  late Future<List<_DealerPreview>> _nearbyDealers;
  late Future<List<_DealerPreview>> _topRatedDealers;

  @override
  void initState() {
    super.initState();
    _availableNow = _fetchAvailableNow();
    _nearbyDealers = _fetchDealers('nearest');
    _topRatedDealers = _fetchDealers('rating');
  }

  Future<List<Listing>> _fetchAvailableNow() async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/inventory/search');
    return (response.data as List).map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<_DealerPreview>> _fetchDealers(String sort) async {
    final apiClient = ref.read(apiClientProvider);
    final response = await apiClient.dio.get('/dealers', queryParameters: {'sort': sort});
    return (response.data as List)
        .map((e) => _DealerPreview.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  void _refreshAll() {
    setState(() {
      _availableNow = _fetchAvailableNow();
      _nearbyDealers = _fetchDealers('nearest');
      _topRatedDealers = _fetchDealers('rating');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('قطعتي')),
      body: RefreshIndicator(
        onRefresh: () async => _refreshAll(),
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
            _DealerRail(future: _nearbyDealers),
            const SizedBox(height: 8),
            const _SectionHeader('أفضل التشاليح تقييمًا'),
            _DealerRail(future: _topRatedDealers),
          ],
        ),
      ),
    );
  }
}

class _DealerRail extends StatelessWidget {
  const _DealerRail({required this.future});
  final Future<List<_DealerPreview>> future;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<_DealerPreview>>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const SizedBox(height: 90, child: Center(child: CircularProgressIndicator()));
        }
        final dealers = snapshot.data ?? const <_DealerPreview>[];
        if (snapshot.hasError || dealers.isEmpty) {
          return _PlaceholderRow(
            text: snapshot.hasError ? 'تعذّر تحميل التشاليح.' : 'لا توجد تشاليح موثقة بعد.',
          );
        }
        return SizedBox(
          height: 90,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: dealers.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final dealer = dealers[i];
              return Container(
                width: 160,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(dealer.businessName,
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall),
                    Text(dealer.city, style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(Icons.star, size: 14, color: Colors.amber),
                        Text(' ${dealer.ratingAverage.toStringAsFixed(1)}'),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        );
      },
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
