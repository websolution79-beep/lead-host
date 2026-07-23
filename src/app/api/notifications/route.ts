import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import type { Json } from "@/lib/supabase/database.types";
import { buildPagination, readPagination } from "@/lib/api/pagination";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_read"),
    notificationId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("mark_all_read"),
  }),
]);

type NotificationRow = {
  id: string;
  event_type: string;
  title: string;
  body: string | null;
  metadata: Json;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
};

type NotificationsUpdate = {
  eq: (column: string, value: string) => NotificationsUpdate;
  is: (column: string, value: null) => Promise<{ error: { message?: string } | null }>;
};

type NotificationsUpdateTable = {
  update: (row: { read_at: string }) => NotificationsUpdate;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const status = request.nextUrl.searchParams.get("status");
    const type = request.nextUrl.searchParams.get("type");
    const pagination = readPagination(request.nextUrl.searchParams);
    let query = supabase
      .from("notifications")
      .select("id,event_type,title,body,metadata,read_at,sent_at,created_at", {
        count: "exact",
      })
      .eq("profile_id", profile.id)
      .eq("channel", "internal")
      .order("created_at", { ascending: false });

    if (status === "unread") {
      query = query.is("read_at", null);
    }

    if (type && type !== "all") {
      query = query.like("event_type", `${type}.%`);
    }

    const [
      { data, error, count: filteredCount },
      { count, error: unreadError },
    ] = await Promise.all([
      query.range(pagination.from, pagination.to),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profile.id)
        .eq("channel", "internal")
        .is("read_at", null),
    ]);

    if (error) throw error;
    if (unreadError) throw unreadError;

    const notifications = ((data ?? []) as NotificationRow[]).map((notification) => ({
      id: notification.id,
      eventType: notification.event_type,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata,
      readAt: notification.read_at,
      sentAt: notification.sent_at,
      createdAt: notification.created_at,
      href: readHref(notification.metadata),
    }));

    return NextResponse.json({
      notifications,
      unreadCount: count ?? 0,
      counters: buildCounters(notifications),
      pagination: buildPagination(
        pagination.page,
        pagination.pageSize,
        filteredCount ?? 0,
      ),
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const payload = patchSchema.parse(await request.json());
    const readAt = new Date().toISOString();

    if (payload.action === "mark_read") {
      const notifications = supabase.from("notifications") as unknown as NotificationsUpdateTable;
      const { error } = await (notifications
        .update({ read_at: readAt })
        .eq("id", payload.notificationId)
        .eq("profile_id", profile.id) as unknown as Promise<{
        error: { message?: string } | null;
      }>);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    const notifications = supabase.from("notifications") as unknown as NotificationsUpdateTable;
    const { error } = await notifications
      .update({ read_at: readAt })
      .eq("profile_id", profile.id)
      .eq("channel", "internal")
      .is("read_at", null);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

function buildCounters(notifications: Array<{ eventType: string; readAt: string | null }>) {
  return notifications.reduce(
    (counters, notification) => {
      counters.all += 1;
      if (!notification.readAt) counters.unread += 1;
      if (notification.eventType.startsWith("lead.")) counters.lead += 1;
      if (notification.eventType.startsWith("wallet.")) counters.wallet += 1;
      if (notification.eventType.startsWith("support.")) counters.support += 1;
      if (notification.eventType.startsWith("pm.")) counters.system += 1;

      return counters;
    },
    { all: 0, unread: 0, lead: 0, wallet: 0, support: 0, system: 0 },
  );
}

function readHref(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const href = (metadata as Record<string, Json>).href;

  return typeof href === "string" ? href : null;
}
