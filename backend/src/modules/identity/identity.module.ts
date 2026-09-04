import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';
import { OTP_PROVIDER, OtpProvider } from './sms/otp-provider.interface';
import { MockOtpProvider } from './sms/providers/mock-otp.provider';
import { TwilioOtpProvider } from './sms/providers/twilio-otp.provider';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [AuthController, UsersController, DealersController],
  providers: [
    AuthService,
    JwtStrategy,
    UsersService,
    DealersService,
    MockOtpProvider,
    TwilioOtpProvider,
    {
      provide: OTP_PROVIDER,
      // OTP_PROVIDER=twilio + TWILIO_* in .env activates real SMS — see
      // backend/README.md. Defaults to mock (fixed "0000" code) so a
      // fresh checkout with no Twilio account still boots and the login
      // flow still works end to end.
      useFactory: (
        config: ConfigService,
        mock: MockOtpProvider,
        twilioProvider: TwilioOtpProvider,
      ): OtpProvider => (config.get<string>('otp.provider') === 'twilio' ? twilioProvider : mock),
      inject: [ConfigService, MockOtpProvider, TwilioOtpProvider],
    },
  ],
  exports: [UsersService, DealersService],
})
export class IdentityModule {}
