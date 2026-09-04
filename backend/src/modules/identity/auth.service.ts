import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

// OTP delivery is an external service the spec leaves open (section 7.6:
// "مزوّدون محليون معتمدون في السعودية، أو Firebase Phone Auth"). This
// in-memory mock lets registration/login be built and demoed end-to-end
// before that provider is picked — swap requestOtp/verify for a real
// gateway call and everything downstream (JWT issuance, user creation)
// is unaffected.
const MOCK_OTP = '0000';

@Injectable()
export class AuthService {
  private readonly pendingCodes = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    this.pendingCodes.set(dto.phone, MOCK_OTP);
    return { sent: true, devHint: `mock OTP is ${MOCK_OTP}` };
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
