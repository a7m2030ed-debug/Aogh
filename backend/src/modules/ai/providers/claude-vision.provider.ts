import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CanonicalPartsService } from '../../catalog/canonical-parts.service';
import {
  AiVisionProvider,
  VisionRecognitionContext,
  VisionSuggestion,
} from '../ai-vision.interface';

// Only ever returns a canonicalPartId when the model is confident enough
// to match one of the platform's own known parts — this is what makes
// canonicalPartId worth anything: a made-up id would just break the
// listing-creation flow, which requires a real one
// (see modules/inventory/dto/create-listing.dto.ts).
const RecognitionResultSchema = z.object({
  suggestions: z.array(
    z.object({
      canonicalPartId: z
        .string()
        .nullable()
        .describe('Only set this if you are confident it matches one of the known parts listed below. Otherwise null.'),
      partNameGuess: z.string(),
      vehicleMakeGuess: z.string().nullable(),
      vehicleModelGuess: z.string().nullable(),
      vehicleYearGuess: z.number().nullable(),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('Realistic confidence 0-1. Do not overstate — an unclear photo should score low.'),
    }),
  ),
});

// Real implementation of the pluggable AI vision seam (ai-vision.interface.ts).
// Activate with AI_VISION_PROVIDER=claude + AI_VISION_API_KEY in .env — see
// backend/README.md. Uses structured outputs (zodOutputFormat) rather than
// asking for free-text JSON, so a malformed response can't slip past
// ai-vision.service.ts's "always suggestions + confidence, never a final
// answer" contract (spec sections 10, 57) — it just comes back empty and
// the client shows "لم نتمكن من التعرف على القطعة" (see
// mobile image_search_screen.dart / add_listing_screen.dart).
@Injectable()
export class ClaudeVisionProvider implements AiVisionProvider {
  private readonly logger = new Logger(ClaudeVisionProvider.name);
  private readonly client: Anthropic;

  constructor(
    private readonly config: ConfigService,
    private readonly canonicalParts: CanonicalPartsService,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('aiVision.apiKey') || undefined,
    });
  }

  async recognizePart(
    imageUrl: string,
    context?: VisionRecognitionContext,
  ): Promise<VisionSuggestion[]> {
    try {
      const knownParts = await this.canonicalParts.findAll();
      const partsList = knownParts
        .slice(0, 400)
        .map((part) => `${part.id}: ${part.canonicalNameAr} / ${part.canonicalNameEn}`)
        .join('\n');

      const contextNote = context?.knownVehicleModelId
        ? `السياق: السيارة محددة مسبقًا (معرف الموديل: ${context.knownVehicleModelId}` +
          `${context.knownVehicleYear ? `، سنة ${context.knownVehicleYear}` : ''}) — ركّز فقط على` +
          ` تحديد نوع القطعة ضمن هذا السياق، لا تحاول إعادة تحديد السيارة.`
        : 'لا يوجد سياق سيارة محدد مسبقًا. حاول تحديد الشركة والموديل والسنة إن كان ذلك واضحًا من الصورة، ولا تخترع تفاصيل غير مؤكدة.';

      const response = await this.client.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 2048,
        output_config: {
          format: zodOutputFormat(RecognitionResultSchema),
          effort: 'low',
        },
        system:
          'أنت مساعد يحلل صور قطع غيار سيارات مستعملة لمنصة "قطعتي" السعودية. ' +
          'مهمتك اقتراح فقط وليس قرارًا نهائيًا — التاجر أو العميل هو من يؤكد أو يعدّل دائمًا. ' +
          'أرجع مستوى ثقة واقعي، ولا تدّعي ثقة عالية إن كانت الصورة غير واضحة أو زاوية التصوير سيئة.\n\n' +
          `القطع المعروفة حاليًا في قاعدة البيانات (استخدم canonicalPartId فقط عند تطابق واضح):\n${
            partsList || '(لا توجد قطع مُدخلة بعد)'
          }\n\n${contextNote}`,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: imageUrl } },
              {
                type: 'text',
                text: 'حلل هذه الصورة وأرجع اقتراحًا واحدًا على الأقل لنوع القطعة، مع بيانات السيارة إن أمكن تحديدها.',
              },
            ],
          },
        ],
      });

      // Zod's .nullable() gives back `T | null`; VisionSuggestion's
      // optional fields are `T | undefined` — map the wire shape onto the
      // interface's shape rather than widening the interface for one provider.
      return (response.parsed_output?.suggestions ?? []).map((s) => ({
        canonicalPartId: s.canonicalPartId ?? undefined,
        partNameGuess: s.partNameGuess,
        vehicleMakeGuess: s.vehicleMakeGuess ?? undefined,
        vehicleModelGuess: s.vehicleModelGuess ?? undefined,
        vehicleYearGuess: s.vehicleYearGuess ?? undefined,
        confidence: s.confidence,
      }));
    } catch (error) {
      // A failed AI call must degrade to "couldn't recognize this" (empty
      // suggestions), never take down the upload flow — the manual-entry
      // path (spec section 14) exists exactly for this.
      this.logger.warn(`Claude vision recognition failed: ${(error as Error).message}`);
      return [];
    }
  }
}
