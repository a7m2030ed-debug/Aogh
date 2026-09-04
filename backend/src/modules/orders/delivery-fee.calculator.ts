import { Injectable } from '@nestjs/common';

// Spec section 25 is explicit: "لا نريد تثبيت مبلغ 25 أو 30 ريال لكل القطع
// بشكل دائم" — the fee must depend on distance/city/size/weight/part type
// and be easy to retune. This isolates that logic behind one method so
// pricing changes never touch the orders/checkout flow that calls it.
@Injectable()
export class DeliveryFeeCalculator {
  calculate(distanceKm: number | null): number {
    if (distanceKm == null) return 25; // fallback flat fee when no location is known yet
    if (distanceKm <= 10) return 20;
    if (distanceKm <= 30) return 30;
    return 50;
  }
}
