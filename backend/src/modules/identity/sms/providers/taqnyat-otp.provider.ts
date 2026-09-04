import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProvider, OtpSendResult } from '../otp-provider.interface';

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Taqnyat wants international format with neither a leading "+" nor "00"
// (per their OpenAPI spec), while the rest of the app stores E.164
// ("+9665..."). Normalizing here keeps that provider quirk from leaking
// into the User table or the login DTOs.
function toTaqnyatRecipient(phone: string): string {
  const digitsOnly = phone.replace(/[^\d+]/g, '');
  return digitsOnly.replace(/^\+/, '').replace(/^00/, '');
}

// Real OTP delivery through Taqnyat (تقنيات) — a Saudi SMS gateway.
// Activate with OTP_PROVIDER=taqnyat + TAQNYAT_TOKEN / TAQNYAT_SENDER in
// .env; see backend/README.md.
//
// Why a local provider alongside Twilio: A2P SMS to Saudi numbers needs a
// sender name registered with the local regulator, and the Saudi gateways
// handle that registration as part of onboarding — usually the fastest
// route to actually sending to +966 numbers. Twilio stays wired as the
// international option; both implement the same OtpProvider interface, so
// switching is one .env line.
//
// Request shape verified against Taqnyat's published OpenAPI spec
// (github.com/taqnyat/OpenAPI, sms/v1/openapi.yaml): POST /v1/messages,
// bearer auth, { recipients[], body, sender }, 201 on success.
@Injectable()
export class TaqnyatOtpProvider implements OtpProvider {
  private readonly logger = new Logger(TaqnyatOtpProvider.name);
  private static readonly ENDPOINT = 'https://api.taqnyat.sa/v1/messages';

  constructor(private readonly config: ConfigService) {}

  async sendOtp(phone: string): Promise<OtpSendResult> {
    const code = generateSixDigitCode();
    const response = await fetch(TaqnyatOtpProvider.ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.get<string>('otp.taqnyatToken') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipients: [toTaqnyatRecipient(phone)],
        body: `رمز التحقق لتطبيق قطعتي: ${code}`,
        sender: this.config.get<string>('otp.taqnyatSender') ?? '',
      }),
    });

    if (!response.ok) {
      // Their error body is { statusCode, message }; fall back to the HTTP
      // status when the response isn't JSON at all (gateway/proxy errors).
      const detail = await response.text().catch(() => '');
      this.logger.error(`Taqnyat SMS send failed for ${phone}: HTTP ${response.status} ${detail}`);
      throw new Error(`Taqnyat SMS send failed with status ${response.status}`);
    }

    return { code };
  }
}
