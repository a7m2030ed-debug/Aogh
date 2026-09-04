import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

/// Spec sections 9-10: AI never decides, it only suggests — the user must
/// always see "هل هذه المعلومات صحيحة؟" with an explicit edit path before
/// anything is used. This screen models that state machine (idle → picked
/// → analyzing → suggestion shown for confirm/edit); the actual call to
/// POST /ai/vision/recognize-part is a TODO until an image upload/storage
/// endpoint exists on the backend to get a URL to send.
class ImageSearchScreen extends StatefulWidget {
  const ImageSearchScreen({super.key});

  @override
  State<ImageSearchScreen> createState() => _ImageSearchScreenState();
}

enum _Stage { idle, analyzing, suggested, notRecognized }

class _ImageSearchScreenState extends State<ImageSearchScreen> {
  File? _image;
  _Stage _stage = _Stage.idle;

  Future<void> _pickImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 85);
    if (picked == null) return;
    setState(() {
      _image = File(picked.path);
      _stage = _Stage.analyzing;
    });

    // TODO: MediaUploadService(ref.read(apiClientProvider)).upload(_image!,
    // UploadCategory.listingPhoto, contentType: 'image/jpeg') for the
    // public URL, then POST /ai/vision/recognize-part with it. Needs this
    // widget converted to ConsumerStatefulWidget to reach `ref`. Simulated
    // result below stands in until that's wired up.
    await Future.delayed(const Duration(seconds: 1));
    if (!mounted) return;
    setState(() => _stage = _Stage.suggested);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('البحث بالصورة')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: _image == null
                    ? const Center(child: Icon(Icons.image_outlined, size: 48))
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.file(_image!, fit: BoxFit.cover),
                      ),
              ),
            ),
            const SizedBox(height: 16),
            if (_stage == _Stage.idle) ...[
              FilledButton.icon(
                onPressed: () => _pickImage(ImageSource.camera),
                icon: const Icon(Icons.camera_alt),
                label: const Text('تصوير القطعة'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => _pickImage(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('اختيار من المعرض'),
              ),
            ] else if (_stage == _Stage.analyzing) ...[
              const CircularProgressIndicator(),
            ] else if (_stage == _Stage.suggested) ...[
              const _SuggestionCard(),
            ],
          ],
        ),
      ),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('هل هذه المعلومات صحيحة؟', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text('Toyota Camry 2022 — صدام أمامي'),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(onPressed: () {}, child: const Text('تأكيد')),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(onPressed: () {}, child: const Text('تعديل')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
