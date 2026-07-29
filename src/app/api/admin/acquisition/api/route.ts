import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchOwnerLeadApiSettings,
  generateOwnerLeadApiToken,
  saveOwnerLeadApiSettings,
} from "@/lib/config/owner-lead-api-settings";
import { appUrl } from "@/lib/env";
import { ownerLeadApiExample } from "@/lib/owner-requests/api-ingestion";

const patchSchema = z.object({
  enabled: z.boolean(),
});

const actionSchema = z.object({
  action: z.enum(["generate_secret", "rotate_secret"]),
});

type LeadSourceLog = {
  id: string;
  owner_request_id: string | null;
  external_id: string | null;
  idempotency_key: string;
  received_at: string;
  processed_at: string | null;
  error_message: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [{ settings, storageReady }, logsResult, countResult] =
      await Promise.all([
        fetchOwnerLeadApiSettings(supabase),
        supabase
          .from("lead_sources")
          .select(
            "id,owner_request_id,external_id,idempotency_key,received_at,processed_at,error_message",
          )
          .eq("channel", "api")
          .order("received_at", { ascending: false })
          .limit(30),
        supabase
          .from("lead_sources")
          .select("id", { count: "exact", head: true })
          .eq("channel", "api"),
      ]);

    const logs = logsResult.error
      ? []
      : ((logsResult.data ?? []) as LeadSourceLog[]).map((log) => ({
          id: log.id,
          ownerRequestId: log.owner_request_id,
          externalId: log.external_id,
          receivedAt: log.received_at,
          processedAt: log.processed_at,
          errorMessage: log.error_message,
          status: log.error_message
            ? "failed"
            : log.owner_request_id && log.processed_at
              ? "created"
              : "processing",
        }));

    return NextResponse.json(
      {
        endpointUrl: `${appUrl.replace(/\/$/, "")}/api/integrations/owner-leads`,
        settings: {
          enabled: settings.enabled,
          configured: Boolean(settings.tokenHash),
          tokenPrefix: settings.tokenPrefix,
          createdAt: settings.createdAt,
          rotatedAt: settings.rotatedAt,
        },
        samplePayload: ownerLeadApiExample,
        logs,
        totalReceived: countResult.count ?? logs.length,
        logsReady: !logsResult.error,
        storageReady,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = patchSchema.parse(await request.json());
    const { settings } = await fetchOwnerLeadApiSettings(supabase);

    if (payload.enabled && !settings.tokenHash) {
      return NextResponse.json(
        { error: "Genera prima una chiave webhook." },
        { status: 422 },
      );
    }

    const updatedSettings = {
      ...settings,
      enabled: payload.enabled,
    };

    await saveOwnerLeadApiSettings({
      supabase,
      profileId: profile.id,
      settings: updatedSettings,
    });

    return NextResponse.json({
      ok: true,
      settings: {
        enabled: updatedSettings.enabled,
        configured: Boolean(updatedSettings.tokenHash),
        tokenPrefix: updatedSettings.tokenPrefix,
        createdAt: updatedSettings.createdAt,
        rotatedAt: updatedSettings.rotatedAt,
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = actionSchema.parse(await request.json());
    const { settings } = await fetchOwnerLeadApiSettings(supabase);

    if (payload.action === "generate_secret" && settings.tokenHash) {
      return NextResponse.json(
        {
          error:
            "Una chiave è già configurata. Usa la rigenerazione per sostituirla.",
        },
        { status: 409 },
      );
    }

    const generated = generateOwnerLeadApiToken();
    const now = new Date().toISOString();
    const updatedSettings = {
      enabled: settings.enabled,
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      createdAt: settings.createdAt ?? now,
      rotatedAt:
        payload.action === "rotate_secret" && settings.tokenHash ? now : null,
    };

    await saveOwnerLeadApiSettings({
      supabase,
      profileId: profile.id,
      settings: updatedSettings,
    });

    return NextResponse.json({
      ok: true,
      secret: generated.secret,
      settings: {
        enabled: updatedSettings.enabled,
        configured: true,
        tokenPrefix: updatedSettings.tokenPrefix,
        createdAt: updatedSettings.createdAt,
        rotatedAt: updatedSettings.rotatedAt,
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
