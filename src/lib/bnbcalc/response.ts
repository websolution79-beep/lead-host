import { z } from "zod";

const analysisDataSchema = z
  .object({
    _id: z.string().min(1),
    url: z.string().url().optional(),
    currency: z.string().trim().min(3).transform((value) => value.toUpperCase()),
    fullAddress: z.string().optional(),
    ratePerNightUSD: z.number().finite().nonnegative().optional(),
    occupancyRatePercentage: z.number().finite().min(0).max(100).optional(),
    adr: z
      .object({ avg: z.number().finite().nonnegative() })
      .passthrough()
      .optional(),
    occupancy: z
      .object({ avg: z.number().finite().min(0).max(1) })
      .passthrough()
      .optional(),
  })
  .passthrough();

const analysisResponseSchema = z.object({
  success: z.literal(true),
  data: analysisDataSchema,
});

export type BnbcalcAnalysisResult = {
  analysisId: string;
  reportUrl: string | null;
  fullAddress: string | null;
  sourceCurrency: string;
  adr: number;
  occupancyPercentage: number;
  requiresEurConversion: boolean;
};

export class BnbcalcApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "BnbcalcApiError";
  }
}

export function parseBnbcalcAnalysisResponse(
  payload: unknown,
): BnbcalcAnalysisResult {
  const parsed = analysisResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new BnbcalcApiError(
      `Risposta BNBCalc incompleta: ${parsed.error.issues[0]?.message ?? "dati mancanti"}`,
      200,
    );
  }

  const data = parsed.data.data;
  const adr = data.adr?.avg ?? data.ratePerNightUSD;
  const occupancyPercentage =
    data.occupancy?.avg !== undefined
      ? data.occupancy.avg * 100
      : data.occupancyRatePercentage;

  if (adr === undefined || occupancyPercentage === undefined) {
    throw new BnbcalcApiError(
      "La risposta BNBCalc non contiene ADR e occupazione medi.",
      200,
    );
  }

  return {
    analysisId: data._id,
    reportUrl: data.url ?? null,
    fullAddress: data.fullAddress ?? null,
    sourceCurrency: data.currency,
    adr,
    occupancyPercentage,
    requiresEurConversion: data.currency !== "EUR",
  };
}
