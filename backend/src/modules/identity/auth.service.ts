import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OTP_PROVIDER, OtpProvider } from './sms/otp-provider.interface';

// A code is worth one SMS and a handful of guesses, and no more.
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

interface PendingCode {
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

@Injectable()
export class AuthService {
  // In-process, which is fine for one instance and is what the pilot runs.
  // Two things to know before scaling out: these codes don't survive a
  // restart, and they aren't shared between instances — moving this to
  // Redis is the change to make then, not a rewrite of the flow.
  private readonly pendingCodes = new Map<string, PendingCode>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    const existing = this.pendingCodes.get(dto.phone);

    // Every send costs real money with a live SMS provider, so a resend
    // for a code that's still valid is refused rather than served — this
    // is the difference between "someone tapped resend twice" and
    // "someone is billing us by the thousand".
    if (existing && Date.now() - existing.sentAt < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000,
      );
      throw new BadRequestException(
        `انتظر ${waitSeconds} ثانية قبل طلب رمز جديد.`,
      );
    }

    const { code, devHint } = await this.otpProvider.sendOtp(dto.phone);
    this.pendingCodes.set(dto.phone, {
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
      sentAt: Date.now(),
    });
    this.pruneExpired();
    return { sent: true, devHint };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const pending = this.pendingCodes.get(dto.phone);

    // One message for "no code", "expired" and "wrong" on purpose: a
    // distinct "that number has no pending code" reply would confirm which
    // numbers are mid-login.
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingCodes.delete(dto.phone);
      throw new UnauthorizedException('رمز التحقق غير صحيح أو منتهي.');
    }

    // Without this a 6-digit code is a million guesses away from anyone's
    // account, and nothing was stopping them from making all million.
    pending.attempts += 1;
    if (pending.attempts > MAX_ATTEMPTS) {
      this.pendingCodes.delete(dto.phone);
      throw new UnauthorizedException('تجاوزت عدد المحاولات. اطلب رمزًا جديدًا.');
    }

    if (pending.code !== dto.code) {
      throw new UnauthorizedException('رمز التحقق غير صحيح أو منتهي.');
    }

    // Single use.
    this.pendingCodes.delete(dto.phone);

    const user = await this.prisma.user.upsert({
      where: { phone: dto.phone },
      update: { name: dto.name, city: dto.city },
      create: { phone: dto.phone, name: dto.name, city: dto.city },
    });

    return this.issueToken(user.id, user.role);
  }

  // Keeps the map from growing without bound on a long-running process.
  private pruneExpired() {
    const now = Date.now();
    for (const [phone, pending] of this.pendingCodes) {
      if (pending.expiresAt < now) this.pendingCodes.delete(phone);
    }
  }

  private issueToken(sub: string, role: string) {
    const accessToken = this.jwt.sign({ sub, role });
    return { accessToken };
  }
}
