import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/utils/phone.dart';

/// Spec section 5 + the technical review's addition (4.1): the municipal
/// license field is kept separate from the commercial registry number
/// because it's a distinct 1446H/2025 requirement specific to vehicle
/// teardown/used-parts shops, not covered by a general CR. Posts to
/// POST /dealers/register (backend/src/modules/identity/dealers.controller.ts),
/// which requires businessName, activityType, contactName, contactPhone,
/// city — commercialRegistryNo/municipalLicenseNo stay optional there so a
/// dealer can start the review process before every document is ready.
class RegisterDealerScreen extends ConsumerStatefulWidget {
  const RegisterDealerScreen({super.key});

  @override
  ConsumerState<RegisterDealerScreen> createState() => _RegisterDealerScreenState();
}

class _RegisterDealerScreenState extends ConsumerState<RegisterDealerScreen> {
  final _businessNameController = TextEditingController();
  final _activityTypeController = TextEditingController(text: 'تشليح ومحل بيع قطع غيار مستعملة');
  final _crController = TextEditingController();
  final _municipalLicenseController = TextEditingController();
  final _contactNameController = TextEditingController();
  final _contactPhoneController = TextEditingController();
  final _cityController = TextEditingController(text: 'الرياض');
  bool _privacyAccepted = false;
  bool _submitting = false;
  bool _submitted = false;

  @override
  void dispose() {
    _businessNameController.dispose();
    _activityTypeController.dispose();
    _crController.dispose();
    _municipalLicenseController.dispose();
    _contactNameController.dispose();
    _contactPhoneController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post('/dealers/register', data: {
        'businessName': _businessNameController.text.trim(),
        'activityType': _activityTypeController.text.trim(),
        'commercialRegistryNo':
            _crController.text.trim().isEmpty ? null : _crController.text.trim(),
        'municipalLicenseNo': _municipalLicenseController.text.trim().isEmpty
            ? null
            : _municipalLicenseController.text.trim(),
        'contactName': _contactNameController.text.trim(),
        'contactPhone': toE164Saudi(_contactPhoneController.text),
        'city': _cityController.text.trim(),
      });
      if (!mounted) return;
      setState(() => _submitted = true);
    } on DioException catch (e) {
      // A 401 here already triggered ApiClient's global redirect to
      // /login (core/api/api_client.dart) — nothing left to do for it.
      if (!mounted || e.response?.statusCode == 401) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('تعذّر إرسال الطلب. حاول مرة أخرى.')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_submitted) {
      return Scaffold(
        appBar: AppBar(title: const Text('تسجيل كتاجر / تشليح')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.hourglass_top, size: 48),
                SizedBox(height: 12),
                Text('طلبك قيد المراجعة. سنخبرك فور التحقق من بيانات منشأتك.',
                    textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('تسجيل كتاجر / تشليح')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          TextField(
            controller: _businessNameController,
            decoration: const InputDecoration(labelText: 'اسم المنشأة'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _activityTypeController,
            decoration: const InputDecoration(labelText: 'نوع النشاط'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _contactNameController,
            decoration: const InputDecoration(labelText: 'اسم المسؤول'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _contactPhoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(labelText: 'رقم جوال المسؤول', prefixText: '+966 '),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _crController,
            decoration: const InputDecoration(labelText: 'رقم السجل التجاري (اختياري الآن)'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _municipalLicenseController,
            decoration: const InputDecoration(
              labelText: 'رقم الترخيص البلدي للنشاط (اختياري الآن)',
              helperText: 'اشتراط بلدي جديد خاص بنشاط تشليح المركبات (١٤٤٦هـ)',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _cityController,
            decoration: const InputDecoration(labelText: 'المدينة'),
          ),
          const SizedBox(height: 16),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _privacyAccepted,
            onChanged: (v) => setState(() => _privacyAccepted = v ?? false),
            title: Text.rich(
              TextSpan(
                style: Theme.of(context).textTheme.bodyMedium,
                children: [
                  const TextSpan(text: 'أوافق على '),
                  TextSpan(
                    text: 'سياسة الخصوصية',
                    style: const TextStyle(decoration: TextDecoration.underline),
                    recognizer: TapGestureRecognizer()..onTap = () => context.push('/legal/privacy'),
                  ),
                  const TextSpan(text: ' و'),
                  TextSpan(
                    text: 'شروط الاستخدام',
                    style: const TextStyle(decoration: TextDecoration.underline),
                    recognizer: TapGestureRecognizer()..onTap = () => context.push('/legal/terms'),
                  ),
                ],
              ),
            ),
            controlAffinity: ListTileControlAffinity.leading,
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: (_privacyAccepted && !_submitting) ? _submit : null,
            child: _submitting
                ? const SizedBox(
                    width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('إرسال للمراجعة'),
          ),
        ],
      ),
    );
  }
}
