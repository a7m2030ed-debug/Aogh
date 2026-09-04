import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/api/media_upload_service.dart';

/// Spec sections 12-14 — the dealer's core loop: صورة → AI → مراجعة →
/// سعر/حالة → نشر. Mirrors ImageSearchScreen's confirm/edit contract
/// (section 10: AI never auto-publishes): the canonical-part dropdown is
/// pre-selected from the AI guess but always editable, because
/// CreateListingDto.canonicalPartId is required and the AI response only
/// ever gives a free-text guess, never that id directly.
class AddListingScreen extends ConsumerStatefulWidget {
  const AddListingScreen({super.key});

  @override
  ConsumerState<AddListingScreen> createState() => _AddListingScreenState();
}

enum _Condition { excellent, good, acceptable, needsRepair }

extension on _Condition {
  String get labelAr => switch (this) {
        _Condition.excellent => 'ممتازة',
        _Condition.good => 'جيدة',
        _Condition.acceptable => 'مقبولة',
        _Condition.needsRepair => 'تحتاج إصلاح',
      };

  // Matches backend's ListingCondition enum (prisma/schema.prisma).
  String get wireValue => switch (this) {
        _Condition.excellent => 'EXCELLENT',
        _Condition.good => 'GOOD',
        _Condition.acceptable => 'ACCEPTABLE',
        _Condition.needsRepair => 'NEEDS_REPAIR',
      };
}

class _CanonicalPart {
  const _CanonicalPart({required this.id, required this.nameAr, required this.nameEn});
  final String id;
  final String nameAr;
  final String nameEn;
}

class _AddListingScreenState extends ConsumerState<AddListingScreen> {
  File? _image;
  String? _uploadedImageUrl;
  bool _analyzing = false;
  bool _publishing = false;
  String? _aiSuggestionLabel;
  final _priceController = TextEditingController();
  final _notesController = TextEditingController();
  _Condition _condition = _Condition.good;

  List<_CanonicalPart> _canonicalParts = [];
  String? _selectedCanonicalPartId;

  @override
  void initState() {
    super.initState();
    _loadCanonicalParts();
  }

  @override
  void dispose() {
    _priceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadCanonicalParts() async {
    try {
      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.dio.get('/catalog/canonical-parts');
      final parts = (response.data as List)
          .map((e) => _CanonicalPart(
                id: e['id'] as String,
                nameAr: e['canonicalNameAr'] as String,
                nameEn: e['canonicalNameEn'] as String,
              ))
          .toList();
      if (!mounted) return;
      setState(() => _canonicalParts = parts);
    } on DioException {
      // Non-fatal — the dropdown just stays empty and publish is blocked
      // until parts load or the dealer retries.
    }
  }

  Future<void> _capture() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
    if (picked == null) return;
    setState(() {
      _image = File(picked.path);
      _analyzing = true;
      _aiSuggestionLabel = null;
    });

    try {
      final publicUrl = await ref.read(mediaUploadServiceProvider).upload(
            _image!,
            UploadCategory.listingPhoto,
            contentType: 'image/jpeg',
          );
      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.dio.post('/ai/vision/recognize-part', data: {
        'imageUrl': publicUrl,
      });
      final suggestions = response.data['suggestions'] as List;
      if (!mounted) return;
      setState(() {
        _uploadedImageUrl = publicUrl;
        _analyzing = false;
      });
      if (suggestions.isNotEmpty) {
        final guess = suggestions.first as Map<String, dynamic>;
        final partNameGuess = guess['partNameGuess'] as String;
        setState(() => _aiSuggestionLabel = partNameGuess);
        _preselectCanonicalPart(partNameGuess);
      }
    } on DioException {
      if (!mounted) return;
      setState(() {
        _analyzing = false;
        _uploadedImageUrl = null;
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر تحليل الصورة. أضف القطعة يدويًا أدناه.')));
    }
  }

  void _preselectCanonicalPart(String guess) {
    final match = _canonicalParts.where((p) => p.nameAr.contains(guess) || guess.contains(p.nameAr));
    if (match.isNotEmpty) {
      setState(() => _selectedCanonicalPartId = match.first.id);
    }
  }

  Future<void> _publish() async {
    final canonicalPartId = _selectedCanonicalPartId;
    final price = num.tryParse(_priceController.text.trim());
    if (canonicalPartId == null || price == null || _uploadedImageUrl == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('صوّر القطعة، اختر نوعها، وأدخل السعر قبل النشر.')),
      );
      return;
    }

    setState(() => _publishing = true);
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post('/inventory/listings', data: {
        'canonicalPartId': canonicalPartId,
        'price': price,
        'quantity': 1,
        'condition': _condition.wireValue,
        'notes': _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
        'imageUrls': [_uploadedImageUrl],
        'aiSuggested': _aiSuggestionLabel != null,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم نشر القطعة.')));
      setState(() {
        _image = null;
        _uploadedImageUrl = null;
        _aiSuggestionLabel = null;
        _selectedCanonicalPartId = null;
        _priceController.clear();
        _notesController.clear();
      });
    } on DioException {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر نشر القطعة. حاول مرة أخرى.')));
    } finally {
      if (mounted) setState(() => _publishing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إضافة قطعة')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          GestureDetector(
            onTap: _capture,
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: _image == null
                    ? const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.camera_alt_outlined, size: 40),
                            SizedBox(height: 8),
                            Text('اضغط للتصوير'),
                          ],
                        ),
                      )
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.file(_image!, fit: BoxFit.cover),
                      ),
              ),
            ),
          ),
          if (_analyzing) ...[
            const SizedBox(height: 12),
            const Center(child: CircularProgressIndicator()),
          ],
          if (_aiSuggestionLabel != null) ...[
            const SizedBox(height: 12),
            Chip(
              avatar: const Icon(Icons.auto_awesome, size: 16),
              label: Text('اقتراح AI: $_aiSuggestionLabel'),
            ),
          ],
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            value: _selectedCanonicalPartId,
            decoration: const InputDecoration(labelText: 'نوع القطعة'),
            items: _canonicalParts
                .map((p) => DropdownMenuItem(value: p.id, child: Text(p.nameAr)))
                .toList(),
            onChanged: (v) => setState(() => _selectedCanonicalPartId = v),
            hint: Text(_canonicalParts.isEmpty ? 'جارِ التحميل...' : 'اختر نوع القطعة'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _priceController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'السعر (ريال)'),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<_Condition>(
            value: _condition,
            decoration: const InputDecoration(labelText: 'الحالة'),
            items: _Condition.values
                .map((c) => DropdownMenuItem(value: c, child: Text(c.labelAr)))
                .toList(),
            onChanged: (v) => setState(() => _condition = v ?? _condition),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notesController,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'ملاحظات (اختياري)'),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _publishing ? null : _publish,
            child: _publishing
                ? const SizedBox(
                    width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('تأكيد ونشر'),
          ),
        ],
      ),
    );
  }
}
