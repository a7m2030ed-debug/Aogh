import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/utils/phone.dart';

/// Spec section 4: phone + OTP registration/login. Matches the backend's
/// two-step flow (POST /auth/otp/request, POST /auth/otp/verify) in
/// backend/src/modules/identity/auth.service.ts — the dev/mock OTP there
/// is always "0000".
class PhoneOtpScreen extends ConsumerStatefulWidget {
  const PhoneOtpScreen({super.key});

  @override
  ConsumerState<PhoneOtpScreen> createState() => _PhoneOtpScreenState();
}

class _PhoneOtpScreenState extends ConsumerState<PhoneOtpScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  bool _codeSent = false;
  bool _privacyAccepted = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.dio.post('/auth/otp/request', data: {
        'phone': toE164Saudi(_phoneController.text),
      });
      if (!mounted) return;
      setState(() => _codeSent = true);
    } on DioException catch (e) {
      setState(() => _error = _messageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyOtp() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.dio.post('/auth/otp/verify', data: {
        'phone': toE164Saudi(_phoneController.text),
        'code': _codeController.text.trim(),
      });
      final token = response.data['accessToken'] as String;
      await ref.read(authTokenStoreProvider).save(token);

      // Route dealers straight to their dashboard rather than the
      // customer home screen. Requires a second call (JWT payload only
      // carries {sub, role} as of when it was issued — see
      // backend/src/modules/identity/auth.service.ts — not decoded
      // client-side here, since /users/me is already the source of truth
      // other screens use for the current user).
      final me = await apiClient.dio.get('/users/me');
      final role = me.data['role'] as String?;
      if (!mounted) return;
      final isDealer = role == 'DEALER_OWNER' || role == 'DEALER_STAFF';
      context.go(isDealer ? '/dealer/dashboard' : '/');
    } on DioException catch (e) {
      setState(() => _error = _messageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _messageFor(DioException e) {
    if (e.response?.statusCode == 401) return 'رمز التحقق غير صحيح أو منتهي.';
    return 'تعذّر الاتصال بالخادم. حاول مرة أخرى.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تسجيل الدخول')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              enabled: !_codeSent,
              decoration: const InputDecoration(labelText: 'رقم الجوال', prefixText: '+966 '),
            ),
            const SizedBox(height: 16),
            if (_codeSent)
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'رمز التحقق (OTP)'),
              ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 12),
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
              onPressed: (_privacyAccepted && !_loading)
                  ? (_codeSent ? _verifyOtp : _requestOtp)
                  : null,
              child: _loading
                  ? const SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_codeSent ? 'تأكيد الرمز' : 'إرسال رمز التحقق'),
            ),
          ],
        ),
      ),
    );
  }
}
