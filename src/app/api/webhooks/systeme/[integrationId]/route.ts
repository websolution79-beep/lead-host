import { createSystemeWebhookDependencies } from "@/lib/marketing/systeme/service";
import { handleSystemeWebhook } from "@/lib/marketing/systeme/webhook";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ integrationId: string }> }) {
  try {
    const { integrationId } = await context.params;
    return await handleSystemeWebhook(request, integrationId, createSystemeWebhookDependencies());
  } catch {
    console.error("Systeme.io webhook service temporarily unavailable.");
    return Response.json({ error: "Servizio temporaneamente non disponibile." }, { status: 503 });
  }
}
