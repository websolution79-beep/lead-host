import { formatCurrencyCents } from "@/lib/auth/roles";
import {
  fetchTelegramChannelSettings,
  type TelegramChannelSettings,
} from "@/lib/config/telegram-settings";
import { appUrl, getEnv } from "@/lib/env";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramBot = {
  id: number;
  username?: string;
  first_name: string;
};

type TelegramChat = {
  id: number;
  title?: string;
  type: string;
};

type TelegramChatMember = {
  status: string;
  can_post_messages?: boolean;
};

type TelegramMessage = {
  message_id: number;
};

export type TelegramLeadSummary = {
  id: string;
  title: string;
  city: string | null;
  province: string | null;
  propertyType: string | null;
  sharedPriceCents: number;
  exclusivePriceCents: number;
  sharedSlotsSold: number;
  maxSharedSlots?: number;
};

export class TelegramServiceError extends Error {}

type TelegramLogRow = {
  id: string;
  status: "queued" | "sent" | "failed" | "skipped";
};

export function getTelegramEnvironmentStatus() {
  return {
    botTokenConfigured: Boolean(getEnv("TELEGRAM_BOT_TOKEN")),
    channelIdConfigured: Boolean(getEnv("TELEGRAM_CHANNEL_ID")),
  };
}

export async function verifyTelegramConnection() {
  const bot = await telegramRequest<TelegramBot>("getMe");
  const chat = await telegramRequest<TelegramChat>("getChat", {
    chat_id: requireTelegramChannelId(),
  });
  const membership = await telegramRequest<TelegramChatMember>("getChatMember", {
    chat_id: requireTelegramChannelId(),
    user_id: bot.id,
  });
  const canPost =
    membership.status === "creator" ||
    (membership.status === "administrator" && membership.can_post_messages !== false);

  return {
    botUsername: bot.username ?? bot.first_name,
    channelTitle: chat.title ?? String(chat.id),
    channelType: chat.type,
    membershipStatus: membership.status,
    canPost,
  };
}

export async function sendTelegramTestMessage() {
  const result = await sendTelegramMessage({
    text: [
      "TEST COLLEGAMENTO LEAD HOST",
      "",
      "Il bot è collegato correttamente al canale.",
      "I messaggi automatici restano disattivati finche non li abiliti dall'area admin.",
    ].join("\n"),
    buttonUrl: `${appUrl}/app/marketplace`,
    buttonLabel: "Apri Lead Host",
  });

  await insertTestLog({
    messageText: "Test collegamento Lead Host",
    providerMessageId: String(result.message_id),
    status: "sent",
  });

  return result;
}

export async function notifyNewLeadOnTelegram(lead: TelegramLeadSummary) {
  const supabase = createServiceSupabaseClient();
  const { settings } = await fetchTelegramChannelSettings(supabase);

  if (!settings.enabled) {
    return { status: "skipped" as const, reason: "automation_disabled" as const };
  }

  const messageText = renderTelegramLeadMessage(settings, lead);
  const log = await reserveLeadDelivery(lead.id, messageText);

  if (!log) {
    return { status: "skipped" as const, reason: "already_sent_or_queued" as const };
  }

  try {
    const result = await sendTelegramMessage({
      text: messageText,
      buttonUrl: buildLeadUrl(lead.id),
      buttonLabel: "Vedi il lead",
    });

    await updateDeliveryLog(log.id, {
      status: "sent",
      providerMessageId: String(result.message_id),
      errorMessage: null,
      sentAt: new Date().toISOString(),
    });

    return { status: "sent" as const, messageId: result.message_id };
  } catch (error) {
    const message = getErrorMessage(error);
    await updateDeliveryLog(log.id, {
      status: "failed",
      providerMessageId: null,
      errorMessage: message,
      sentAt: null,
    });
    console.warn("Telegram lead notification failed:", message);

    return { status: "failed" as const, error: message };
  }
}

export function renderTelegramLeadMessage(
  settings: TelegramChannelSettings,
  lead: TelegramLeadSummary,
) {
  const maxSharedSlots = lead.maxSharedSlots ?? 2;
  const availableSlots = Math.max(maxSharedSlots - lead.sharedSlotsSold, 0);
  const location = [lead.city, lead.province].filter(Boolean).join(", ") || "Italia";
  const variables: Record<string, string> = {
    title: lead.title,
    location,
    city: lead.city ?? "",
    province: lead.province ?? "",
    property_type: lead.propertyType ?? "Immobile",
    shared_price: formatCurrencyCents(lead.sharedPriceCents),
    exclusive_price: formatCurrencyCents(lead.exclusivePriceCents),
    available_slots: String(availableSlots),
    max_shared_slots: String(maxSharedSlots),
  };

  return settings.messageTemplate.replace(
    /\{\{([a-z_]+)\}\}/g,
    (match, key: string) => variables[key] ?? match,
  );
}

async function sendTelegramMessage({
  text,
  buttonUrl,
  buttonLabel,
}: {
  text: string;
  buttonUrl: string;
  buttonLabel: string;
}) {
  return telegramRequest<TelegramMessage>("sendMessage", {
    chat_id: requireTelegramChannelId(),
    text,
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [[{ text: buttonLabel, url: buttonUrl }]],
    },
  });
}

async function telegramRequest<T>(method: string, payload?: Record<string, unknown>) {
  const token = getEnv("TELEGRAM_BOT_TOKEN");

  if (!token) {
    throw new TelegramServiceError("TELEGRAM_BOT_TOKEN non configurato.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const result = (await response.json().catch(() => null)) as TelegramApiResponse<T> | null;

  if (!response.ok || !result?.ok || !result.result) {
    throw new TelegramServiceError(
      result?.description || `Telegram API non disponibile (${response.status}).`,
    );
  }

  return result.result;
}

function requireTelegramChannelId() {
  const channelId = getEnv("TELEGRAM_CHANNEL_ID");

  if (!channelId) {
    throw new TelegramServiceError("TELEGRAM_CHANNEL_ID non configurato.");
  }

  return channelId.trim();
}

function buildLeadUrl(leadId: string) {
  const url = new URL(`/app/marketplace/${leadId}`, appUrl);
  url.searchParams.set("utm_source", "telegram");
  url.searchParams.set("utm_medium", "channel");
  url.searchParams.set("utm_campaign", "new_lead");

  return url.toString();
}

async function reserveLeadDelivery(leadId: string, messageText: string) {
  const supabase = createServiceSupabaseClient();
  const logs = supabase.from("telegram_delivery_logs" as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{
            data: TelegramLogRow | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{
          data: TelegramLogRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
    update: (row: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: TelegramLogRow | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };
  const { data: existing, error: lookupError } = await logs
    .select("id,status")
    .eq("event_type", "lead.published")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(
      "Registro Telegram non disponibile. Applica la migration telegram_channel_notifications.",
    );
  }

  if (existing?.status === "sent" || existing?.status === "queued") {
    return null;
  }

  if (existing) {
    const { data, error } = await logs
      .update({
        channel_id: requireTelegramChannelId(),
        message_text: messageText,
        status: "queued",
        error_message: null,
        provider_message_id: null,
        sent_at: null,
      })
      .eq("id", existing.id)
      .select("id,status")
      .single();

    if (error || !data) throw error ?? new Error("Invio Telegram non prenotato.");

    return data;
  }

  const { data, error } = await logs
    .insert({
      lead_id: leadId,
      event_type: "lead.published",
      channel_id: requireTelegramChannelId(),
      message_text: messageText,
      status: "queued",
    })
    .select("id,status")
    .single();

  if (error?.code === "23505") return null;
  if (error || !data) throw error ?? new Error("Invio Telegram non registrato.");

  return data;
}

async function updateDeliveryLog(
  id: string,
  update: {
    status: "sent" | "failed";
    providerMessageId: string | null;
    errorMessage: string | null;
    sentAt: string | null;
  },
) {
  const supabase = createServiceSupabaseClient();
  const logs = supabase.from("telegram_delivery_logs" as never) as unknown as {
    update: (row: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
  const { error } = await logs
    .update({
      status: update.status,
      provider_message_id: update.providerMessageId,
      error_message: update.errorMessage,
      sent_at: update.sentAt,
    })
    .eq("id", id);

  if (error) console.warn("Telegram log update failed:", error.message);
}

async function insertTestLog({
  messageText,
  providerMessageId,
  status,
}: {
  messageText: string;
  providerMessageId: string;
  status: "sent";
}) {
  const supabase = createServiceSupabaseClient();
  const logs = supabase.from("telegram_delivery_logs" as never) as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{
      error: { code?: string; message?: string } | null;
    }>;
  };
  const { error } = await logs.insert({
    event_type: "connection.test",
    channel_id: requireTelegramChannelId(),
    message_text: messageText,
    provider_message_id: providerMessageId,
    status,
    metadata: { test: true },
    sent_at: new Date().toISOString(),
  });

  if (error) {
    console.warn("Telegram test log not stored:", error.message);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Errore Telegram sconosciuto.";
}
