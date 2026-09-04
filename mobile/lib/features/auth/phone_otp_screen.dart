import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Spec section 4: phone + OTP registration/login. Matches the backend's
/// two-step flow (POST /auth/otp/request, POST /auth/otp/verify) in
/// backend/src/modules/identity/auth.service.ts — the dev/mock OTP there
/// is always "0000".
class PhoneOtpScreen extends StatefulWidget {
  const PhoneOtpScreen({super.key});

  @override
  State<PhoneOtpScreen> createState() => _PhoneOtpScreenState();
}

class _PhoneOtpScreenState extends State<PhoneOtpScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  bool _codeSent = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  void _requestOtp() {
    // TODO: POST /auth/otp/request
    setState(() => _codeSent = true);
  }

  void _verifyOtp() {
    // TODO: POST /auth/otp/verify, persist token via AuthTokenStore
    context.go('/');
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
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _codeSent ? _verifyOtp : _requestOtp,
              child: Text(_codeSent ? 'تأكيد الرمز' : 'إرسال رمز التحقق'),
            ),
          ],
        ),
      ),
    );
  }
}
