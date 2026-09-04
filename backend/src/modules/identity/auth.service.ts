import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OTP_PROVIDER, OtpProvider } from './sms/otp-provider.interface';

@Injectable()
export class AuthService {
  private readonly pendingCodes = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    const { code, devHint } = await this.otpProvider.sendOtp(dto.phone);
    this.pendingCodes.set(dto.phone, code);
    return { sent: true, devHint };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const expected = this.pendingCodes.get(dto.phone);
    if (!expected || expected !== dto.code) {
      throw new UnauthorizedException('Invalid or expired OTP code');
    }
    this.pendingCodes.delete(dto.phone);

    const user = await this.prisma.user.upsert({
      where: { phone: dto.phone },
      update: { name: dto.name, city: dto.city },
      create: { phone: dto.phone, name: dto.name, city: dto.city },
    });

    return this.issueToken(user.id, user.role);
  }

  private issueToken(sub: string, role: string) {
    const accessToken = this.jwt.sign({ sub, role });
    return { accessToken };
  }
}
