"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  Clock3,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import type {
  AddonManualAccess,
  AddonPropertyManagerOption,
  AddonSubscriptionStatus,
} from "@/lib/addons/types";
import { createPublicSupabaseClient } from "@/lib/supabase/client";

type AccessResponse = {
  accesses: AddonManualAccess[];
  candidates: AddonPropertyManagerOption[];
  error?: string;
};

type AccessModal =
  | { mode: "grant"; access: AddonManualAccess | null }
  | { mode: "revoke"; access: AddonManualAccess };

export function AdminAddonAccessManager({
  onChanged,
}: {
  onChanged?: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [accesses, setAccesses] = useState<AddonManualAccess[]>([]);
  const [candidates, setCandidates] = useState<AddonPropertyManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<AddonPropertyManagerOption | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [modal, setModal] = useState<AccessModal | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const requestAccesses = useCallback(
    async (searchValue = "") => {
      const token = await getToken();
      if (!token) throw new Error("Sessione Super Admin non trovata.");
      const query = searchValue
        ? `?search=${encodeURIComponent(searchValue)}`
        : "";
      const response = await fetch(`/api/admin/addons/access${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as AccessResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Non riesco a caricare gli accessi manuali.");
      }
      return payload;
    },
    [getToken],
  );

  const loadAccesses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await requestAccesses();
      setAccesses(payload.accesses);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [requestAccesses]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadAccesses(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAccesses]);

  function openGrantModal(access: AddonManualAccess | null = null) {
    setModal({ mode: "grant", access });
    setSearch("");
    setCandidates([]);
    setSelectedProfile(
      access
        ? {
            profileId: access.profileId,
            email: access.email,
            firstName: access.firstName,
            lastName: access.lastName,
            profileStatus: "active",
            currentAccess: {
              id: access.id,
              source: "manual",
              status: access.status,
              accessExpiresAt: access.accessExpiresAt,
            },
          }
        : null,
    );
    setExpiresAt(toLocalDateTime(access?.accessExpiresAt ?? null));
    setReason(access?.manualReason ?? "");
    setError("");
    setSuccess("");
  }

  function openRevokeModal(access: AddonManualAccess) {
    setModal({ mode: "revoke", access });
    setReason("");
    setError("");
    setSuccess("");
  }

  function closeModal() {
    if (saving) return;
    setModal(null);
    setSelectedProfile(null);
    setCandidates([]);
    setReason("");
    setExpiresAt("");
  }

  async function searchPropertyManagers() {
    const normalized = search.trim();
    if (normalized.length < 2) {
      setError("Inserisci almeno 2 caratteri per cercare.");
      return;
    }

    setSearching(true);
    setError("");
    try {
      const payload = await requestAccesses(normalized);
      setCandidates(payload.candidates);
      if (!payload.candidates.length) {
        setError("Nessun Property Manager trovato.");
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSearching(false);
    }
  }

  async function saveAccess() {
    if (!selectedProfile) {
      setError("Seleziona un Property Manager.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Inserisci una motivazione di almeno 3 caratteri.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione Super Admin non trovata.");
      const response = await fetch("/api/admin/addons/access", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId: selectedProfile.profileId,
          accessExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          reason: reason.trim(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Accesso non salvato.");

      setSuccess(modal?.mode === "grant" && modal.access ? "Accesso aggiornato." : "Accesso assegnato.");
      setModal(null);
      await loadAccesses();
      await onChanged?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function revokeAccess() {
    if (modal?.mode !== "revoke") return;
    if (reason.trim().length < 3) {
      setError("Inserisci una motivazione di almeno 3 caratteri.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sessione Super Admin non trovata.");
      const response = await fetch("/api/admin/addons/access", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptionId: modal.access.id,
          reason: reason.trim(),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Accesso non revocato.");

      setSuccess("Accesso manuale revocato.");
      setModal(null);
      await loadAccesses();
      await onChanged?.();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="card min-w-0 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <ShieldCheck size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink sm:text-xl">Accessi manuali</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Assegna il modulo senza creare un abbonamento o un pagamento Stripe.
              </p>
            </div>
          </div>
          <button className="btn btn-primary w-full sm:w-auto" type="button" onClick={() => openGrantModal()}>
            <Plus size={17} />
            Assegna accesso
          </button>
        </div>

        {error && !modal ? <Alert tone="error">{error}</Alert> : null}
        {success && !modal ? <Alert tone="success">{success}</Alert> : null}

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
          {loading ? (
            <p className="p-6 text-center text-sm text-muted">Carico gli accessi...</p>
          ) : accesses.length ? (
            <div className="divide-y divide-slate-200">
              {accesses.map((access) => {
                const canManage = access.effectiveStatus === "active";
                return (
                  <article
                    className="grid min-w-0 gap-4 p-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,.8fr)_auto] md:items-center"
                    key={access.id}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserRound className="shrink-0 text-emerald-700" size={18} />
                        <p className="truncate font-semibold text-ink">{displayName(access)}</p>
                      </div>
                      <p className="mt-1 break-all text-sm text-muted">{access.email}</p>
                      {access.manualReason ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                          {access.manualReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <AccessStatus status={access.effectiveStatus} />
                      <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                        <CalendarClock className="shrink-0" size={16} />
                        {access.accessExpiresAt
                          ? `Scade ${formatDateTime(access.accessExpiresAt)}`
                          : "Nessuna scadenza"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {canManage ? (
                        <>
                          <button className="btn btn-secondary min-h-10 px-3" type="button" onClick={() => openGrantModal(access)}>
                            <Pencil size={15} />
                            Modifica
                          </button>
                          <button className="btn min-h-10 border border-red-200 bg-red-50 px-3 text-red-700 hover:bg-red-100" type="button" onClick={() => openRevokeModal(access)}>
                            <X size={15} />
                            Revoca
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-secondary min-h-10 px-3" type="button" onClick={() => openGrantModal(access)}>
                          <Plus size={15} />
                          Riattiva
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-7 text-center">
              <ShieldCheck className="mx-auto text-slate-300" size={30} />
              <p className="mt-3 font-semibold text-ink">Nessun accesso manuale</p>
              <p className="mt-1 text-sm text-muted">Gli accessi assegnati compariranno qui.</p>
            </div>
          )}
        </div>
      </section>

      {modal ? (
        <div className="fixed inset-0 z-[100] flex bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5">
          <section className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-lg">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-bold uppercase text-emerald-700">Modulo Marketing</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">
                  {modal.mode === "revoke"
                    ? "Revoca accesso"
                    : modal.access
                      ? "Modifica accesso"
                      : "Assegna accesso manuale"}
                </h3>
              </div>
              <button className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600" type="button" aria-label="Chiudi" onClick={closeModal}>
                <X size={19} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {modal.mode === "grant" ? (
                <div className="grid gap-5">
                  {!modal.access && !selectedProfile ? (
                    <div>
                      <label className="text-sm font-semibold text-ink" htmlFor="addon-pm-search">Cerca Property Manager</label>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <div className="relative min-w-0 flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} />
                          <input
                            id="addon-pm-search"
                            className="input pl-10"
                            placeholder="Nome, cognome o email"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void searchPropertyManagers();
                            }}
                          />
                        </div>
                        <button className="btn btn-secondary w-full sm:w-auto" type="button" disabled={searching} onClick={() => void searchPropertyManagers()}>
                          <Search size={16} />
                          {searching ? "Cerco..." : "Cerca"}
                        </button>
                      </div>
                      {candidates.length ? (
                        <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200">
                          {candidates.map((candidate) => {
                            const unavailable = candidate.profileStatus !== "active" || candidate.currentAccess?.source === "stripe";
                            return (
                              <button
                                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55"
                                type="button"
                                disabled={unavailable}
                                key={candidate.profileId}
                                onClick={() => {
                                  setSelectedProfile(candidate);
                                  const existing = candidate.currentAccess?.source === "manual"
                                    ? accesses.find((access) => access.id === candidate.currentAccess?.id)
                                    : null;
                                  setExpiresAt(toLocalDateTime(existing?.accessExpiresAt ?? null));
                                  setReason(existing?.manualReason ?? "");
                                  setCandidates([]);
                                }}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-ink">{displayName(candidate)}</span>
                                  <span className="block break-all text-sm text-muted">{candidate.email}</span>
                                </span>
                                <span className="shrink-0 text-xs font-semibold text-muted">
                                  {candidate.currentAccess?.source === "stripe"
                                    ? "Abbonato Stripe"
                                    : candidate.currentAccess
                                      ? "Già assegnato"
                                      : candidate.profileStatus === "suspended"
                                        ? "Sospeso"
                                        : "Seleziona"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedProfile ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{displayName(selectedProfile)}</p>
                          <p className="mt-1 break-all text-sm text-muted">{selectedProfile.email}</p>
                        </div>
                        {!modal.access ? (
                          <button className="text-sm font-bold text-emerald-800" type="button" onClick={() => setSelectedProfile(null)}>Cambia</button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedProfile ? (
                    <>
                      <label className="grid gap-2 text-sm font-semibold text-ink">
                        <span>Scadenza accesso <span className="font-normal text-muted">(facoltativa)</span></span>
                        <input className="input" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
                        <span className="text-xs font-normal leading-5 text-muted">Lascia vuoto per un accesso senza scadenza.</span>
                      </label>
                      <label className="grid gap-2 text-sm font-semibold text-ink">
                        <span>Motivazione *</span>
                        <textarea className="input min-h-28 resize-y py-3" maxLength={1000} placeholder="Esempio: accesso omaggio per partnership" value={reason} onChange={(event) => setReason(event.target.value)} />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-5">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="font-semibold text-ink">{displayName(modal.access)}</p>
                    <p className="mt-1 break-all text-sm text-muted">{modal.access.email}</p>
                    <p className="mt-3 text-sm leading-6 text-red-700">L’utente perderà l’accesso manuale al Modulo Marketing.</p>
                  </div>
                  <label className="grid gap-2 text-sm font-semibold text-ink">
                    <span>Motivo della revoca *</span>
                    <textarea className="input min-h-28 resize-y py-3" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                </div>
              )}

              {error && modal ? <Alert tone="error">{error}</Alert> : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button className="btn btn-secondary w-full sm:w-auto" type="button" disabled={saving} onClick={closeModal}>Annulla</button>
              {modal.mode === "grant" ? (
                <button className="btn btn-primary w-full sm:w-auto" type="button" disabled={saving || !selectedProfile} onClick={() => void saveAccess()}>
                  <Check size={17} />
                  {saving ? "Salvataggio..." : modal.access ? "Aggiorna accesso" : "Assegna accesso"}
                </button>
              ) : (
                <button className="btn w-full border border-red-200 bg-red-600 text-white hover:bg-red-700 sm:w-auto" type="button" disabled={saving} onClick={() => void revokeAccess()}>
                  <X size={17} />
                  {saving ? "Revoca..." : "Conferma revoca"}
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

function AccessStatus({ status }: { status: AddonSubscriptionStatus }) {
  const labels: Record<AddonSubscriptionStatus, string> = {
    incomplete: "Incompleto",
    trialing: "In prova",
    active: "Attivo",
    past_due: "Pagamento in ritardo",
    paused: "In pausa",
    unpaid: "Non pagato",
    canceled: "Revocato",
    expired: "Scaduto",
  };
  const active = status === "active" || status === "trialing";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
      {active ? <Check size={13} /> : <Clock3 size={13} />}
      {labels[status]}
    </span>
  );
}

function Alert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <div className={`mt-4 rounded-lg border p-3 text-sm font-semibold ${tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {children}
    </div>
  );
}

function displayName(person: { firstName: string; lastName: string; email: string }) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || person.email;
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

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operazione non riuscita.";
}
