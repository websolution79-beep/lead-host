import { NextResponse, type NextRequest } from "next/server";
import { processServiceEmailQueue } from "@/lib/email/service-campaigns";
import { getEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const cronSecret = getEnv("CRON_SECRET");

  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processServiceEmailQueue(5, 100);

    return NextResponse.json({ ok: true, worker: result });
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
