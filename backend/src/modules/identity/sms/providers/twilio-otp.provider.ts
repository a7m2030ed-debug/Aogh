import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { OtpProvider, OtpSendResult } from '../otp-provider.interface';

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Real OTP delivery. Activate with OTP_PROVIDER=twilio + TWILIO_ACCOUNT_SID /
// TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER in .env — see backend/README.md.
// Twilio is a straightforward global default (works for Saudi numbers,
// simple API-key setup); the spec (review section 7.6) also lists Firebase
// Phone Auth as an option, but that needs its own Firebase project — the
// same blocker as push notifications (see modules/notifications) — so
// Twilio is what's actually wired here.
@Injectable()
export class TwilioOtpProvider implements OtpProvider {
  private readonly logger = new Logger(TwilioOtpProvider.name);
  private readonly client: ReturnType<typeof twilio>;
  private readonly fromNumber: string;

  constructor(private readonly config: ConfigService) {
    this.client = twilio(
      this.config.get<string>('otp.twilioAccountSid'),
      this.config.get<string>('otp.twilioAuthToken'),
    );
    this.fromNumber = this.config.get<string>('otp.twilioFromNumber') ?? '';
  }

  async sendOtp(phone: string): Promise<OtpSendResult> {
    const code = generateSixDigitCode();
    try {
      await this.client.messages.create({
        to: phone,
        from: this.fromNumber,
        body: `رمز التحقق لتطبيق قطعتي: ${code}`,
      });
    } catch (error) {
      this.logger.error(`Twilio SMS send failed for ${phone}: ${(error as Error).message}`);
      throw error;
    }
    return { code };
  }
}
