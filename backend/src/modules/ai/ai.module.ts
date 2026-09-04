import { Module } from '@nestjs/common';
import { AI_VISION_PROVIDER } from './ai-vision.interface';
import { MockVisionProvider } from './providers/mock-vision.provider';
import { AiVisionService } from './ai-vision.service';
import { AiVisionController } from './ai-vision.controller';

@Module({
  controllers: [AiVisionController],
  providers: [
    AiVisionService,
    { provide: AI_VISION_PROVIDER, useClass: MockVisionProvider },
  ],
  exports: [AiVisionService],
})
export class AiModule {}
