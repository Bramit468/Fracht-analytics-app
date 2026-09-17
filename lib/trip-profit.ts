export type TripProfitInput = {
  revenueCents: number;
  distanceKm: number;
  fuelUsedLiters: number;
  fuelPriceCentsPerLiter: number;
  tollsCents: number;
  driverCostCents: number;
  otherCostsCents: number;
};

export type TripProfitResult = {
  fuelCents: number;
  totalCostCents: number;
  profitCents: number;
  marginPercent: number | null;
  profitPerKm: number | null;
};

export function calculateTripProfit(input: TripProfitInput): TripProfitResult {
  const fuelCents = Math.round(input.fuelUsedLiters * input.fuelPriceCentsPerLiter);
  const totalCostCents = fuelCents + input.tollsCents + input.driverCostCents + input.otherCostsCents;
  const profitCents = input.revenueCents - totalCostCents;
  return {
    fuelCents,
    totalCostCents,
    profitCents,
    marginPercent: input.revenueCents > 0 ? (profitCents / input.revenueCents) * 100 : null,
    profitPerKm: input.distanceKm > 0 ? profitCents / 100 / input.distanceKm : null,
  };
}
