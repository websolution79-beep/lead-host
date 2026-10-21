import { NextResponse, type NextRequest } from "next/server";
import { processServiceEmailQueue } from "@/lib/email/service-campaigns";
import { getEnv } from "@/lib/env";
import { runMarketplacePromotionWorkerSafely } from "@/lib/team-compensation/marketplace-promotion-worker";
import {
  reconcileTeamRefundCompensationsSafely,
  runTeamCompensationWorkerSafely,
} from "@/lib/team-compensation/worker";

export async function GET(request: NextRequest) {
  const cronSecret = getEnv("CRON_SECRET");

  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [result, compensations, refundCompensations, marketplacePromotions] = await Promise.all([
      processServiceEmailQueue(5, 100),
      runTeamCompensationWorkerSafely(100),
      reconcileTeamRefundCompensationsSafely(),
      runMarketplacePromotionWorkerSafely(100),
    ]);

    return NextResponse.json({
      ok: true,
      worker: result,
      compensations,
      refundCompensations,
      marketplacePromotions,
    });
  } catch (error) {
    console.error(
      "Service email cron failed:",
      error instanceof Error ? error.message : "Errore sconosciuto.",
    );

    return NextResponse.json(
      { error: "Coda comunicazioni di servizio non elaborata." },
      { status: 500 },
    );
  }
}
