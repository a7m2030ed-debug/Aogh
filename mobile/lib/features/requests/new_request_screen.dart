import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api/api_client.dart';
import '../../core/api/media_upload_service.dart';

/// The whole customer product: three fields, an optional photo, send.
///
/// The part name is free text with suggestions from the seeded parts
/// dictionary (GET /catalog/canonical-parts) rather than a picker — a
/// customer describing a part in their own words must never be blocked by
/// it not being in our list. Make and model are dropdowns from the vehicle
/// catalog, which keeps the values consistent for dealers reading the feed.
class NewRequestScreen extends ConsumerStatefulWidget {
  const NewRequestScreen({super.key});

  @override
  ConsumerState<NewRequestScreen> createState() => _NewRequestScreenState();
}

class _NewRequestScreenState extends ConsumerState<NewRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  final _partNameController = TextEditingController();

  List<_Make> _makes = [];
  List<String> _models = [];
  List<String> _partSuggestions = [];
  String? _makeId;
  String? _makeName;
  String? _modelName;
  File? _photo;
  bool _loadingCatalog = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadCatalog();
  }

  @override
  void dispose() {
    _partNameController.dispose();
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    try {
      final dio = ref.read(apiClientProvider).dio;
      final results = await Future.wait([
        dio.get('/catalog/vehicles/makes'),
        dio.get('/catalog/canonical-parts'),
      ]);
      if (!mounted) return;
      setState(() {
        // GET /catalog/vehicles/makes already nests each make's models, so
        // they're kept here rather than fetched again when a make is
        // picked — selecting a make fills the model dropdown instantly
        // instead of waiting on a round-trip.
        _makes = (results[0].data as List)
            .map((e) => _Make(
                  id: e['id'] as String,
                  name: (e['nameAr'] as String?)?.isNotEmpty == true
                      ? e['nameAr'] as String
                      : e['nameEn'] as String,
                  models: ((e['models'] as List?) ?? const [])
                      .map((m) => (m['nameAr'] as String?)?.isNotEmpty == true
                          ? m['nameAr'] as String
                          : m['nameEn'] as String)
                      .toList(),
                ))
            .toList();
        _partSuggestions = (results[1].data as List)
            .map((e) => e['canonicalNameAr'] as String? ?? '')
            .where((name) => name.isNotEmpty)
            .toList();
        _loadingCatalog = false;
      });
    } on DioException {
      // The form still works without the catalog — make/model fall back to
      // free text below, so a catalog outage can't block a request.
      if (!mounted) return;
      setState(() => _loadingCatalog = false);
    }
  }

  Future<void> _pickPhoto() async {
    final picked =
        await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked == null) return;
    setState(() => _photo = File(picked.path));
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      String? photoUrl;
      if (_photo != null) {
        photoUrl = await ref.read(mediaUploadServiceProvider).upload(
              _photo!,
              UploadCategory.requestPhoto,
              contentType: 'image/jpeg',
            );
      }
      await ref.read(apiClientProvider).dio.post('/requests', data: {
        'partName': _partNameController.text.trim(),
        'vehicleMake': _makeName,
        'vehicleModel': _modelName,
        if (photoUrl != null) 'photoUrl': photoUrl,
      });
      if (!mounted) return;
      _partNameController.clear();
      setState(() {
        _photo = null;
        _submitting = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال طلبك للتجّار. بننبهك أول ما يرد أحد.')),
      );
      context.go('/requests');
    } on DioException {
      if (!mounted) return;
      setState(() {
        _error = 'تعذّر إرسال الطلب. تأكد من الاتصال وحاول مرة أخرى.';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('وش القطعة اللي تدور عليها؟')),
      body: _loadingCatalog
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'اكتب القطعة وسيارتك، ويوصل طلبك لكل التجّار. اللي عنده القطعة بيرد عليك مباشرة.',
                      style: theme.textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),

                    Autocomplete<String>(
                      optionsBuilder: (value) {
                        final query = value.text.trim();
                        if (query.isEmpty) return const Iterable<String>.empty();
                        return _partSuggestions
                            .where((name) => name.contains(query))
                            .take(6);
                      },
                      onSelected: (value) => _partNameController.text = value,
                      fieldViewBuilder: (context, controller, focusNode, onSubmit) {
                        // Autocomplete owns its controller; mirror it into
                        // ours so _submit reads what's actually on screen
                        // whether it was typed or picked from the list.
                        controller.addListener(
                          () => _partNameController.text = controller.text,
                        );
                        return TextFormField(
                          controller: controller,
                          focusNode: focusNode,
                          decoration: const InputDecoration(
                            labelText: 'اسم القطعة',
                            hintText: 'مثال: مقص أمامي يمين',
                            prefixIcon: Icon(Icons.build_outlined),
                          ),
                          validator: (value) => (value == null || value.trim().length < 2)
                              ? 'اكتب اسم القطعة'
                              : null,
                        );
                      },
                    ),
                    const SizedBox(height: 16),

                    DropdownButtonFormField<String>(
                      initialValue: _makeId,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'ماركة السيارة',
                        prefixIcon: Icon(Icons.directions_car_outlined),
                      ),
                      items: _makes
                          .map((make) => DropdownMenuItem(value: make.id, child: Text(make.name)))
                          .toList(),
                      onChanged: (value) {
                        if (value == null) return;
                        final make = _makes.firstWhere((m) => m.id == value);
                        setState(() {
                          _makeId = value;
                          _makeName = make.name;
                          _models = make.models;
                          _modelName = null;
                        });
                      },
                      validator: (value) => value == null ? 'اختر الماركة' : null,
                    ),
                    const SizedBox(height: 16),

                    DropdownButtonFormField<String>(
                      initialValue: _modelName,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: 'موديل السيارة',
                        prefixIcon: const Icon(Icons.car_repair_outlined),
                        helperText: _makeId == null ? 'اختر الماركة أولاً' : null,
                      ),
                      items: _models
                          .map((model) => DropdownMenuItem(value: model, child: Text(model)))
                          .toList(),
                      onChanged: _models.isEmpty
                          ? null
                          : (value) => setState(() => _modelName = value),
                      validator: (value) => value == null ? 'اختر الموديل' : null,
                    ),
                    const SizedBox(height: 20),

                    _PhotoField(
                      photo: _photo,
                      onPick: _pickPhoto,
                      onClear: () => setState(() => _photo = null),
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 16),
                      Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                    ],

                    const SizedBox(height: 28),
                    FilledButton.icon(
                      onPressed: _submitting ? null : _submit,
                      icon: _submitting
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send),
                      label: Text(_submitting ? 'جارٍ الإرسال...' : 'أرسل الطلب للتجّار'),
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _PhotoField extends StatelessWidget {
  const _PhotoField({required this.photo, required this.onPick, required this.onClear});

  final File? photo;
  final VoidCallback onPick;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    if (photo == null) {
      return OutlinedButton.icon(
        onPressed: onPick,
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('أرفق صورة للقطعة (اختياري)'),
        style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
      );
    }
    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.file(photo!, width: 72, height: 72, fit: BoxFit.cover),
        ),
        const SizedBox(width: 12),
        const Expanded(child: Text('صورة مرفقة')),
        IconButton(onPressed: onClear, icon: const Icon(Icons.close)),
      ],
    );
  }
}

class _Make {
  const _Make({required this.id, required this.name, required this.models});
  final String id;
  final String name;
  final List<String> models;
}
