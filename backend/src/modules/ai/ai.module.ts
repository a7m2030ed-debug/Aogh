import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogModule } from '../catalog/catalog.module';
import { AI_VISION_PROVIDER, AiVisionProvider } from './ai-vision.interface';
import { MockVisionProvider } from './providers/mock-vision.provider';
import { ClaudeVisionProvider } from './providers/claude-vision.provider';
import { AiVisionService } from './ai-vision.service';
import { AiVisionController } from './ai-vision.controller';

@Module({
  imports: [CatalogModule],
  controllers: [AiVisionController],
  providers: [
    AiVisionService,
    MockVisionProvider,
    ClaudeVisionProvider,
    {
      provide: AI_VISION_PROVIDER,
      // AI_VISION_PROVIDER=claude + AI_VISION_API_KEY in .env activates
      // the real provider — see backend/README.md. Defaults to the mock
      // so a fresh checkout with no API key configured still boots and
      // the AI-capture screens still work end to end (just with a fixed
      // suggestion), same reasoning as OTP_PROVIDER defaulting to mock.
      useFactory: (
        config: ConfigService,
        mock: MockVisionProvider,
        claude: ClaudeVisionProvider,
      ): AiVisionProvider => (config.get<string>('aiVision.provider') === 'claude' ? claude : mock),
      inject: [ConfigService, MockVisionProvider, ClaudeVisionProvider],
    },
  ],
  exports: [AiVisionService],
})
export class AiModule {}
