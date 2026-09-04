import { Injectable } from '@nestjs/common';
import { OtpProvider, OtpSendResult } from '../otp-provider.interface';

const MOCK_CODE = '0000';

@Injectable()
export class MockOtpProvider implements OtpProvider {
  async sendOtp(_phone: string): Promise<OtpSendResult> {
    return { code: MOCK_CODE, devHint: `mock OTP is ${MOCK_CODE} — no real SMS sent` };
  }
}
