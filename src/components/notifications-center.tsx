"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleDollarSign,
  LifeBuoy,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type NotificationItem = {
  id: string;
  eventType: string;
  title: string;
  body: string | null;
  metadata: unknown;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
  href: string | null;
};

type NotificationsPayload = {
  notifications: NotificationItem[];
  unreadCount: number;
  counters: Record<string, number>;
  error?: string;
};

const filters = [
  { label: "Tutte", status: "all", type: "all" },
  { label: "Non lette", status: "unread", type: "all" },
  { label: "Lead", status: "all", type: "lead" },
  { label: "Wallet", status: "all", type: "wallet" },
  { label: "Assistenza", status: "all", type: "support" },
  { label: "Sistema", status: "all", type: "pm" },
] as const;

export function NotificationsCenter() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [payload, setPayload] = useState<NotificationsPayload | null>(null);
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>(filters[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const getAccessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();

    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    const token = await getAccessToken();

    if (!token) {
      setError("Sessione non trovata. Effettua di nuovo il login.");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams();

    if (activeFilter.status !== "all") params.set("status", activeFilter.status);
    if (activeFilter.type !== "all") params.set("type", activeFilter.type);

    const response = await fetch(`/api/notifications?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = (await response.json()) as NotificationsPayload;

    if (!response.ok) {
      setError(result.error ?? "Non sono riuscito a caricare le notifiche.");
      setLoading(false);
      return;
    }

    setPayload(result);
    setLoading(false);
  }, [activeFilter, getAccessToken]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const updateReadState = useCallback(
    async (body: { action: "mark_all_read" } | { action: "mark_read"; notificationId: string }) => {
      setSaving(body.action === "mark_all_read" ? "all" : body.notificationId);
      setError("");

      const token = await getAccessToken();

      if (!token) {
        setError("Sessione non trovata. Effettua di nuovo il login.");
        setSaving("");
        return;
      }

      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        setError(result.error ?? "Non sono riuscito ad aggiornare la notifica.");
        setSaving("");
        return;
      }

      await loadNotifications();
      setSaving("");
    },
    [getAccessToken, loadNotifications],
  );

  if (loading) {
    return <section className="card p-8 text-center text-muted">Carico notifiche...</section>;
  }

  return (
    <div className="grid gap-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Centro notifiche</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              {payload?.unreadCount ? `${payload.unreadCount} notifiche da leggere` : "Tutto letto"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Qui trovi gli eventi importanti della piattaforma: nuovi lead, acquisti,
              ricariche wallet, verifica profilo e assistenza.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => void loadNotifications()}>
              <RefreshCw size={17} />
              Aggiorna
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!payload?.unreadCount || saving === "all"}
              onClick={() => void updateReadState({ action: "mark_all_read" })}
            >
              <CheckCheck size={17} />
              Segna tutte lette
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {filters.map((filter) => (
            <button
              key={`${filter.status}-${filter.type}`}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition ${
                activeFilter.label === filter.label
                  ? "border-green bg-green text-white"
                  : "border-slate-200 bg-white text-muted hover:border-green hover:text-green"
              }`}
              type="button"
              onClick={() => setActiveFilter(filter)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3">
        {payload?.notifications.length ? (
          payload.notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              saving={saving === notification.id}
              onMarkRead={() =>
                updateReadState({
                  action: "mark_read",
                  notificationId: notification.id,
                })
              }
            />
          ))
        ) : (
          <div className="card p-8 text-center">
            <Bell className="mx-auto text-green" size={34} />
            <h2 className="mt-4 text-xl font-semibold text-ink">Nessuna notifica</h2>
            <p className="mt-2 text-muted">
              Quando succede qualcosa di rilevante lo vedrai qui.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function NotificationCard({
  notification,
  saving,
  onMarkRead,
}: {
  notification: NotificationItem;
  saving: boolean;
  onMarkRead: () => void;
}) {
  const Icon = notificationIcon(notification.eventType);
  const isUnread = !notification.readAt;

  return (
    <article
      className={`card p-5 transition ${
        isUnread ? "border-green/40 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]" : "bg-white/80"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
              isUnread ? "bg-green text-white" : "bg-slate-100 text-muted"
            }`}
          >
            <Icon size={20} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-ink">{notification.title}</h3>
              {isUnread ? (
                <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-bold text-green">
                  Nuova
                </span>
              ) : null}
            </div>
            {notification.body ? (
              <p className="mt-2 max-w-3xl leading-6 text-muted">{notification.body}</p>
            ) : null}
            <p className="mt-3 text-sm font-semibold text-slate-500">
              {formatDateTime(notification.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {notification.href ? (
            <Link className="btn btn-secondary" href={notification.href}>
              Apri
            </Link>
          ) : null}
          {isUnread ? (
            <button className="btn btn-primary" type="button" disabled={saving} onClick={onMarkRead}>
              Letta
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function notificationIcon(eventType: string) {
  if (eventType.startsWith("lead.")) return Sparkles;
  if (eventType.startsWith("wallet.")) return CircleDollarSign;
  if (eventType.startsWith("support.")) return LifeBuoy;
  if (eventType.startsWith("pm.")) return ShieldCheck;

  return Bell;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
