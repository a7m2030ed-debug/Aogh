/// Normalizes what a Saudi user types (05xxxxxxxx, 5xxxxxxxx, or already
/// +9665xxxxxxxx) into E.164 (+9665xxxxxxxx) — what the backend's
/// @IsPhoneNumber() validator on RequestOtpDto/VerifyOtpDto expects.
String toE164Saudi(String input) {
  final digitsOnly = input.replaceAll(RegExp(r'[^0-9]'), '');
  if (digitsOnly.startsWith('966')) return '+$digitsOnly';
  if (digitsOnly.startsWith('0')) return '+966${digitsOnly.substring(1)}';
  return '+966$digitsOnly';
}
