import { Inject, Injectable } from '@nestjs/common';
import { AI_VISION_PROVIDER, AiVisionProvider } from './ai-vision.interface';
import { RecognizePartDto } from './dto/recognize-part.dto';

@Injectable()
export class AiVisionService {
  constructor(
    @Inject(AI_VISION_PROVIDER) private readonly provider: AiVisionProvider,
  ) {}

  async recognizePart(dto: RecognizePartDto) {
    const suggestions = await this.provider.recognizePart(dto.imageUrl, {
      knownVehicleModelId: dto.knownVehicleModelId,
      knownVehicleYear: dto.knownVehicleYear,
    });

    // Contract with the client apps: always return suggestions + confidence,
    // never a single "answer" — the UI must always offer "تعديل" (edit).
    return { suggestions, requiresConfirmation: true };
  }
}
