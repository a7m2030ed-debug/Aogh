import { Injectable } from '@nestjs/common';
import {
  AiVisionProvider,
  VisionRecognitionContext,
  VisionSuggestion,
} from '../ai-vision.interface';

/**
 * Placeholder implementation so the rest of the app (upload flow, review
 * screen, confidence-score UI) can be built and tested before a real
 * vision model/API key is wired up. Swap AI_VISION_PROVIDER's useClass in
 * ai.module.ts to point at a real provider (e.g. an OpenAI/Claude vision
 * call, or a self-hosted classifier) — nothing else changes.
 */
@Injectable()
export class MockVisionProvider implements AiVisionProvider {
  async recognizePart(
    _imageUrl: string,
    context?: VisionRecognitionContext,
  ): Promise<VisionSuggestion[]> {
    if (context?.knownVehicleModelId) {
      return [
        {
          partNameGuess: 'صدام أمامي',
          confidence: 0.74,
        },
      ];
    }

    return [
      {
        partNameGuess: 'صدام أمامي',
        vehicleMakeGuess: 'Toyota',
        vehicleModelGuess: 'Camry',
        vehicleYearGuess: 2022,
        confidence: 0.41,
      },
    ];
  }
}
