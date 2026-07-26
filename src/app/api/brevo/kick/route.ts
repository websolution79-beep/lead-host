import { after, NextResponse, type NextRequest } from "next/server";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { runBrevoWorkerSafely } from "@/lib/brevo/worker";

export async function POST(request: NextRequest) {
  try {
    await requirePropertyManager(request);
    after(() => runBrevoWorkerSafely(10));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}
