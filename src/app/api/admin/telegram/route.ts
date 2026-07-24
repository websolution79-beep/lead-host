import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  fetchTelegramChannelSettings,
  saveTelegramChannelSettings,
  telegramTemplateVariables,
} from "@/lib/config/telegram-settings";
import {
  getTelegramEnvironmentStatus,
  sendTelegramTestMessage,
  TelegramServiceError,
  verifyTelegramConnection,
} from "@/lib/telegram/service";

const patchSchema = z.object({
  enabled: z.boolean(),
  messageTemplate: z.string().trim().min(20).max(3500),
});

const actionSchema = z.object({
  action: z.enum(["check_connection", "send_test"]),
});

type TelegramLog = {
  id: string;
  event_type: string;
  channel_id: string;
  provider_message_id: string | null;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [{ settings, storageReady }, logsResult] = await Promise.all([
      fetchTelegramChannelSettings(supabase),
      (supabase.from("telegram_delivery_logs" as never) as unknown as {
        select: (columns: string) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => {
            limit: (count: number) => Promise<{
              data: TelegramLog[] | null;
              error: { code?: string; message?: string } | null;
            }>;
          };
        };
      })
        .select(
          "id,event_type,channel_id,provider_message_id,status,error_message,sent_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    return NextResponse.json({
      settings,
      environment: getTelegramEnvironmentStatus(),
      logs: logsResult.error ? [] : logsResult.data ?? [],
      logsReady: !logsResult.error,
      storageReady,
      variables: telegramTemplateVariables,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const settings = patchSchema.parse(await request.json());

    await saveTelegramChannelSettings({
      supabase,
      profileId: profile.id,
      settings,
    });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin(request);
    const payload = actionSchema.parse(await request.json());

    if (payload.action === "check_connection") {
      const connection = await verifyTelegramConnection();

      return NextResponse.json({ ok: true, connection });
    }

    const connection = await verifyTelegramConnection();

    if (!connection.canPost) {
      return NextResponse.json(
        { error: "Il bot non ha il permesso di pubblicare messaggi nel canale." },
        { status: 422 },
      );
    }

    const message = await sendTelegramTestMessage();

    return NextResponse.json({
      ok: true,
      connection,
      messageId: message.message_id,
    });
  } catch (error) {
    if (error instanceof TelegramServiceError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return adminApiErrorResponse(error);
  }
}
