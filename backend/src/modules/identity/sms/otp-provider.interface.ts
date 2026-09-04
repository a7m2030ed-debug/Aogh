// Pluggable OTP delivery — same seam shape as AI_VISION_PROVIDER
// (modules/ai/ai-vision.interface.ts). The provider owns code generation
// too, not just delivery: the mock provider always returns a fixed code
// so local dev/testing never needs to read a log to find it, while a real
// provider generates and sends a random one. AuthService just remembers
// whatever code comes back and checks it on verify.

export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export interface OtpSendResult {
  code: string;
  // Surfaced in the request-otp API response only for providers that
  // don't actually deliver anything (the mock) — never set this for a
  // real provider, or the code leaks in the HTTP response.
  devHint?: string;
}

export interface OtpProvider {
  sendOtp(phone: string): Promise<OtpSendResult>;
}
