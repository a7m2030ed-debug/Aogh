import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/api/media_upload_service.dart';

/// Spec sections 9-10: AI never decides, it only suggests — the user must
/// always see "هل هذه المعلومات صحيحة؟" with an explicit edit path before
/// anything is used. Real flow: upload the photo (MediaUploadService,
/// which is what section-checked-in "does this still need storage" turned
/// into), then POST /ai/vision/recognize-part with the resulting URL.
class ImageSearchScreen extends ConsumerStatefulWidget {
  const ImageSearchScreen({super.key});

  @override
  ConsumerState<ImageSearchScreen> createState() => _ImageSearchScreenState();
}

enum _Stage { idle, analyzing, suggested, notRecognized, error }

class _Suggestion {
  const _Suggestion({
    required this.partNameGuess,
    this.vehicleMakeGuess,
    this.vehicleModelGuess,
    this.vehicleYearGuess,
    required this.confidence,
  });

  factory _Suggestion.fromJson(Map<String, dynamic> json) => _Suggestion(
        partNameGuess: json['partNameGuess'] as String,
        vehicleMakeGuess: json['vehicleMakeGuess'] as String?,
        vehicleModelGuess: json['vehicleModelGuess'] as String?,
        vehicleYearGuess: json['vehicleYearGuess'] as int?,
        confidence: (json['confidence'] as num).toDouble(),
      );

  final String partNameGuess;
  final String? vehicleMakeGuess;
  final String? vehicleModelGuess;
  final int? vehicleYearGuess;
  final double confidence;

  String get label => [
        if (vehicleMakeGuess != null) vehicleMakeGuess,
        if (vehicleModelGuess != null) vehicleModelGuess,
        if (vehicleYearGuess != null) vehicleYearGuess.toString(),
        '— $partNameGuess',
      ].join(' ');

  String get searchQuery =>
      [partNameGuess, vehicleModelGuess, vehicleYearGuess?.toString()]
          .whereType<String>()
          .join(' ');
}

class _ImageSearchScreenState extends ConsumerState<ImageSearchScreen> {
  File? _image;
  _Stage _stage = _Stage.idle;
  _Suggestion? _suggestion;

  Future<void> _pickImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(source: source, imageQuality: 85);
    if (picked == null) return;
    setState(() {
      _image = File(picked.path);
      _stage = _Stage.analyzing;
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
      final suggestions = (response.data['suggestions'] as List)
          .map((e) => _Suggestion.fromJson(e as Map<String, dynamic>))
          .toList();
      if (!mounted) return;
      if (suggestions.isEmpty) {
        setState(() => _stage = _Stage.notRecognized);
      } else {
        setState(() {
          _suggestion = suggestions.first;
          _stage = _Stage.suggested;
        });
      }
    } on DioException {
      if (!mounted) return;
      setState(() => _stage = _Stage.error);
    }
  }

  void _reset() {
    setState(() {
      _image = null;
      _suggestion = null;
      _stage = _Stage.idle;
    });
  }

  void _confirm() {
    final suggestion = _suggestion;
    if (suggestion == null) return;
    context.push('/search?q=${Uri.encodeComponent(suggestion.searchQuery)}');
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
              _SuggestionCard(suggestion: _suggestion!, onConfirm: _confirm, onEdit: _reset),
            ] else if (_stage == _Stage.notRecognized) ...[
              const Text('لم نتمكن من التعرف على القطعة.'),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _reset, child: const Text('حاول بصورة أخرى')),
            ] else if (_stage == _Stage.error) ...[
              const Text('تعذّر تحليل الصورة. تأكد من الاتصال بالخادم.'),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _reset, child: const Text('حاول مرة أخرى')),
            ],
          ],
        ),
      ),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard({required this.suggestion, required this.onConfirm, required this.onEdit});

  final _Suggestion suggestion;
  final VoidCallback onConfirm;
  final VoidCallback onEdit;

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
            Text(suggestion.label),
            const SizedBox(height: 4),
            Text('نسبة الثقة: ${(suggestion.confidence * 100).round()}٪',
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(onPressed: onConfirm, child: const Text('تأكيد')),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(onPressed: onEdit, child: const Text('تعديل')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
