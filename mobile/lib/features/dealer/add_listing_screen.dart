import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

/// Spec sections 12-14 — the dealer's core loop: صورة → AI → مراجعة →
/// سعر/حالة → نشر. Mirrors ImageSearchScreen's confirm/edit contract
/// (section 10: AI never auto-publishes) but adds the price/condition/
/// notes fields the dealer side needs before POST /inventory/listings.
class AddListingScreen extends StatefulWidget {
  const AddListingScreen({super.key});

  @override
  State<AddListingScreen> createState() => _AddListingScreenState();
}

enum _Condition { excellent, good, acceptable, needsRepair }

extension on _Condition {
  String get labelAr => switch (this) {
        _Condition.excellent => 'ممتازة',
        _Condition.good => 'جيدة',
        _Condition.acceptable => 'مقبولة',
        _Condition.needsRepair => 'تحتاج إصلاح',
      };
}

class _AddListingScreenState extends State<AddListingScreen> {
  File? _image;
  bool _aiSuggested = false;
  final _priceController = TextEditingController();
  final _notesController = TextEditingController();
  _Condition _condition = _Condition.good;

  @override
  void dispose() {
    _priceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _capture() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
    if (picked == null) return;
    setState(() => _image = File(picked.path));

    // TODO: same MediaUploadService.upload(...) call as
    // image_search_screen.dart, then POST /ai/vision/recognize-part with
    // the returned publicUrl. That same URL is what gets sent again in
    // _publish() below as this listing's imageUrls entry — one upload,
    // reused for both the AI call and the published listing.
    await Future.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;
    setState(() => _aiSuggested = true);
  }

  void _publish() {
    // TODO: POST /inventory/listings
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('تم النشر (تجريبي — لا يوجد اتصال بالخادم بعد)')),
    );
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
          if (_aiSuggested) ...[
            const SizedBox(height: 12),
            const Chip(
              avatar: Icon(Icons.auto_awesome, size: 16),
              label: Text('اقتراح AI: Toyota Camry 2022 — صدام أمامي'),
            ),
          ],
          const SizedBox(height: 20),
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
          FilledButton(onPressed: _publish, child: const Text('تأكيد ونشر')),
        ],
      ),
    );
  }
}
