import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Spec section 5 + the technical review's addition (4.1): the municipal
/// license field is kept separate from the commercial registry number
/// because it's a distinct 1446H/2025 requirement specific to vehicle
/// teardown/used-parts shops, not covered by a general CR.
class RegisterDealerScreen extends StatefulWidget {
  const RegisterDealerScreen({super.key});

  @override
  State<RegisterDealerScreen> createState() => _RegisterDealerScreenState();
}

class _RegisterDealerScreenState extends State<RegisterDealerScreen> {
  final _businessNameController = TextEditingController();
  final _crController = TextEditingController();
  final _municipalLicenseController = TextEditingController();
  final _cityController = TextEditingController();
  bool _privacyAccepted = false;

  @override
  void dispose() {
    _businessNameController.dispose();
    _crController.dispose();
    _municipalLicenseController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  void _submit() {
    // TODO: POST /dealers/register, then navigate to a "قيد المراجعة" state
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('تم إرسال الطلب (تجريبي — لا يوجد اتصال بالخادم بعد)')),
    );
  }

  @override
  Widget build(BuildContext context) {
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
            controller: _crController,
            decoration: const InputDecoration(labelText: 'رقم السجل التجاري'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _municipalLicenseController,
            decoration: const InputDecoration(
              labelText: 'رقم الترخيص البلدي للنشاط',
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
            onPressed: _privacyAccepted ? _submit : null,
            child: const Text('إرسال للمراجعة'),
          ),
        ],
      ),
    );
  }
}
