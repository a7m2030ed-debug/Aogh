// The spec is explicit (sections 9, 10, 50, 57) that: (1) the AI vision
// provider must be swappable without a rewrite, and (2) AI output is always
// a suggestion with a confidence score, never a final decision — the human
// always confirms or edits before anything is published. This interface is
// the seam that enforces both: every provider returns the same shape, and
// nothing downstream treats the result as ground truth.

export interface VisionSuggestion {
  canonicalPartId?: string;
  partNameGuess: string;
  vehicleMakeGuess?: string;
  vehicleModelGuess?: string;
  vehicleYearGuess?: number;
  confidence: number; // 0..1 — never treated as a final answer, always shown to the user
}

export interface VisionRecognitionContext {
  // When the dealer/customer already picked the car (structured search path,
  // section 7.4 of the review), pass it so the model only has to classify
  // the part, not re-derive the whole vehicle from one photo.
  knownVehicleModelId?: string;
  knownVehicleYear?: number;
}

export const AI_VISION_PROVIDER = Symbol('AI_VISION_PROVIDER');

export interface AiVisionProvider {
  recognizePart(imageUrl: string, context?: VisionRecognitionContext): Promise<VisionSuggestion[]>;
}
