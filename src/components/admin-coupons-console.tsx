"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  CalendarDays,
  Check,
  CircleDollarSign,
  CopyPlus,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { formatCurrencyCents } from "@/lib/auth/roles";

type CouponTier = {
  id?: string;
  minPaidCents: number;
  maxPaidCents: number | null;
  bonusCents: number;
};

type CouponStats = {
  redeemedCount: number;
  pendingCount: number;
  uniqueProfiles: number;
  paidAmountCents: number;
  bonusAmountCents: number;
};

type CouponRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  partner_name: string | null;
  active: boolean;
  first_top_up_only: boolean;
  valid_from: string | null;
  valid_until: string | null;
  max_total_redemptions: number | null;
  max_redemptions_per_profile: number;
  bonus_budget_cents: number | null;
  tiers: CouponTier[];
  stats: CouponStats;
};

type CouponDraft = {
  id?: string;
  code: string;
  name: string;
  description: string;
  partnerName: string;
  active: boolean;
  firstTopUpOnly: boolean;
  validFrom: string;
  validUntil: string;
  maxTotalRedemptions: string;
  maxRedemptionsPerProfile: string;
  bonusBudget: string;
  tiers: Array<{
    id?: string;
    minPaid: string;
    maxPaid: string;
    bonus: string;
  }>;
};

type CouponsResponse = {
  couponsEnabled: boolean;
  storageReady: boolean;
  coupons: CouponRow[];
  error?: string;
};

const launchTiers: CouponDraft["tiers"] = [
  { minPaid: "30", maxPaid: "49,99", bonus: "5" },
  { minPaid: "50", maxPaid: "99,99", bonus: "10" },
  { minPaid: "100", maxPaid: "", bonus: "20" },
];

function emptyDraft(): CouponDraft {
  return {
    code: "LANCIO2026",
    name: "Bonus lancio Lead Host",
    description: "Bonus riservato alla prima ricarica wallet.",
    partnerName: "",
    active: false,
    firstTopUpOnly: true,
    validFrom: "",
    validUntil: "",
    maxTotalRedemptions: "",
    maxRedemptionsPerProfile: "1",
    bonusBudget: "",
    tiers: launchTiers.map((tier) => ({ ...tier })),
  };
}

export function AdminCouponsConsole({ readOnly }: { readOnly: boolean }) {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponsEnabled, setCouponsEnabled] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [draft, setDraft] = useState<CouponDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState<CouponRow | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadCoupons = useCallback(async () => {
    const token = await getToken();

    if (!token) {
      setError("Sessione admin non disponibile.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/coupons", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as CouponsResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare i coupon.");
    } else {
      setCoupons(payload.coupons);
      setCouponsEnabled(payload.couponsEnabled);
      setStorageReady(payload.storageReady);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadCoupons(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCoupons]);

  async function toggleFeature() {
    const token = await getToken();
    if (!token || readOnly) return;

    setSaving(true);
    setError("");
    const enabled = !couponsEnabled;
    const response = await fetch("/api/admin/coupons", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "toggle_feature", enabled }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Aggiornamento non riuscito.");
    } else {
      setCouponsEnabled(enabled);
      setSuccess(
        enabled
          ? "Sistema coupon attivato."
          : "Sistema coupon disattivato. I codici non sono utilizzabili.",
      );
    }
    setSaving(false);
  }

  async function saveCoupon() {
    const token = await getToken();
    if (!token || readOnly) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const response = await fetch("/api/admin/coupons", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "save_coupon",
        coupon: {
          id: draft.id,
          code: draft.code,
          name: draft.name,
          description: draft.description || null,
          partnerName: draft.partnerName || null,
          active: draft.active,
          firstTopUpOnly: draft.firstTopUpOnly,
          validFrom: toIsoDate(draft.validFrom),
          validUntil: toIsoDate(draft.validUntil),
          maxTotalRedemptions: nullableInteger(draft.maxTotalRedemptions),
          maxRedemptionsPerProfile:
            nullableInteger(draft.maxRedemptionsPerProfile) ?? 1,
          bonusBudgetCents: nullableCurrencyCents(draft.bonusBudget),
          tiers: draft.tiers.map((tier) => ({
            minPaidCents: currencyToCents(tier.minPaid),
            maxPaidCents: nullableCurrencyCents(tier.maxPaid),
            bonusCents: currencyToCents(tier.bonus),
          })),
        },
      }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Salvataggio coupon non riuscito.");
    } else {
      setSuccess("Coupon salvato correttamente.");
      setDraft(emptyDraft());
      await loadCoupons();
    }
    setSaving(false);
  }

  async function deleteCoupon() {
    const token = await getToken();
    if (!token || readOnly || !couponToDelete) return;

    setDeleting(true);
    setError("");
    setSuccess("");
    setDeleteError("");

    const response = await fetch("/api/admin/coupons", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: couponToDelete.id }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setDeleteError(payload.error ?? "Eliminazione coupon non riuscita.");
      setDeleting(false);
      return;
    }

    if (draft.id === couponToDelete.id) {
      setDraft(emptyDraft());
    }
    setSuccess(`Coupon ${couponToDelete.code} eliminato definitivamente.`);
    setDeleteError("");
    setCouponToDelete(null);
    await loadCoupons();
    setDeleting(false);
  }

  function editCoupon(coupon: CouponRow) {
    setDraft({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description ?? "",
      partnerName: coupon.partner_name ?? "",
      active: coupon.active,
      firstTopUpOnly: coupon.first_top_up_only,
      validFrom: toDateTimeLocal(coupon.valid_from),
      validUntil: toDateTimeLocal(coupon.valid_until),
      maxTotalRedemptions: coupon.max_total_redemptions?.toString() ?? "",
      maxRedemptionsPerProfile:
        coupon.max_redemptions_per_profile.toString(),
      bonusBudget: centsToInput(coupon.bonus_budget_cents),
      tiers: coupon.tiers.map((tier) => ({
        id: tier.id,
        minPaid: centsToInput(tier.minPaidCents),
        maxPaid: centsToInput(tier.maxPaidCents),
        bonus: centsToInput(tier.bonusCents),
      })),
    });
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateTier(
    index: number,
    field: "minPaid" | "maxPaid" | "bonus",
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      tiers: current.tiers.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [field]: value } : tier,
      ),
    }));
  }

  return (
    <div className="grid gap-6">
      {!storageReady ? (
        <section className="card border-amber-200 bg-amber-50 p-5 text-amber-900">
          Applica la migration dei coupon wallet prima di utilizzare questa
          sezione.
        </section>
      ) : null}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="section-kicker">Stato globale</p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Promozioni wallet
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Disattivando questa funzione nessun codice potrà essere applicato,
              anche se il singolo coupon è attivo.
            </p>
          </div>
          <button
            className={couponsEnabled ? "btn btn-primary" : "btn btn-secondary"}
            type="button"
            disabled={saving || !storageReady || readOnly}
            onClick={toggleFeature}
          >
            <Check size={17} />
            {couponsEnabled ? "Coupon attivi" : "Coupon disattivati"}
          </button>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Configurazione</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              {draft.id ? "Modifica coupon" : "Nuovo coupon"}
            </h2>
          </div>
          {draft.id ? (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setDraft(emptyDraft())}
            >
              <CopyPlus size={17} />
              Nuovo
            </button>
          ) : null}
        </div>

        <fieldset disabled={readOnly} className="contents">
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Field label="Codice coupon *">
            <input
              className="input"
              value={draft.code}
              maxLength={40}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  code: event.target.value.toUpperCase().replace(/\s+/g, ""),
                }))
              }
            />
          </Field>
          <Field label="Nome interno *">
            <input
              className="input"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </Field>
          <Field label="Partner">
            <input
              className="input"
              placeholder="Facoltativo"
              value={draft.partnerName}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  partnerName: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Budget massimo bonus">
            <CurrencyInput
              value={draft.bonusBudget}
              placeholder="Nessun limite"
              onChange={(value) =>
                setDraft((current) => ({ ...current, bonusBudget: value }))
              }
            />
          </Field>
          <Field label="Valido dal">
            <input
              className="input"
              type="datetime-local"
              value={draft.validFrom}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  validFrom: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Valido fino al">
            <input
              className="input"
              type="datetime-local"
              value={draft.validUntil}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  validUntil: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Utilizzi totali massimi">
            <input
              className="input"
              inputMode="numeric"
              placeholder="Nessun limite"
              value={draft.maxTotalRedemptions}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  maxTotalRedemptions: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="Utilizzi massimi per PM *">
            <input
              className="input"
              inputMode="numeric"
              value={draft.maxRedemptionsPerProfile}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  maxRedemptionsPerProfile: event.target.value,
                }))
              }
            />
          </Field>
        </div>

        <Field label="Descrizione interna">
          <textarea
            className="input min-h-24 resize-y"
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </Field>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Toggle
            checked={draft.firstTopUpOnly}
            label="Solo prima ricarica"
            description="Il PM non deve avere ricariche già completate."
            onChange={(checked) =>
              setDraft((current) => ({
                ...current,
                firstTopUpOnly: checked,
              }))
            }
          />
          <Toggle
            checked={draft.active}
            label="Coupon attivo"
            description="Può essere usato solo se è attivo anche lo stato globale."
            onChange={(checked) =>
              setDraft((current) => ({ ...current, active: checked }))
            }
          />
        </div>

        <div className="mt-7 border-t border-slate-200 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-ink">Fasce bonus</h3>
              <p className="mt-1 text-sm text-muted">
                Ogni importo può ricadere in una sola fascia.
              </p>
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  tiers: [
                    ...current.tiers,
                    { minPaid: "", maxPaid: "", bonus: "" },
                  ],
                }))
              }
            >
              <Plus size={17} />
              Aggiungi fascia
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {draft.tiers.map((tier, index) => (
              <div
                className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                key={tier.id ?? index}
              >
                <CurrencyInput
                  label="Ricarica minima"
                  value={tier.minPaid}
                  onChange={(value) => updateTier(index, "minPaid", value)}
                />
                <CurrencyInput
                  label="Ricarica massima"
                  placeholder="Senza limite"
                  value={tier.maxPaid}
                  onChange={(value) => updateTier(index, "maxPaid", value)}
                />
                <CurrencyInput
                  label="Bonus"
                  value={tier.bonus}
                  onChange={(value) => updateTier(index, "bonus", value)}
                />
                <button
                  className="mt-auto flex size-11 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                  type="button"
                  title="Elimina fascia"
                  disabled={draft.tiers.length === 1}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      tiers: current.tiers.filter(
                        (_, tierIndex) => tierIndex !== index,
                      ),
                    }))
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-4 rounded-lg border border-green/20 bg-green/10 p-3 text-sm font-semibold text-green">
            {success}
          </p>
        ) : null}

        <button
          className="btn btn-primary mt-5"
          type="button"
          disabled={saving || !storageReady || readOnly}
          onClick={saveCoupon}
        >
          <Save size={17} />
          {saving ? "Salvataggio..." : "Salva coupon"}
        </button>
        </fieldset>
      </section>

      <section className="card p-5">
        <div>
          <p className="section-kicker">Monitoraggio</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">
            Coupon configurati
          </h2>
        </div>
        {loading ? (
          <p className="mt-5 text-sm text-muted">Caricamento coupon...</p>
        ) : coupons.length === 0 ? (
          <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-muted">
            Nessun coupon configurato.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            {coupons.map((coupon) => (
              <article
                className="rounded-lg border border-slate-200 bg-white p-4"
                key={coupon.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-xs font-bold text-white">
                        {coupon.code}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          coupon.active
                            ? "bg-green/10 text-green"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {coupon.active ? "Attivo" : "Disattivato"}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-ink">
                      {coupon.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {coupon.first_top_up_only
                        ? "Solo prima ricarica"
                        : `Massimo ${coupon.max_redemptions_per_profile} utilizzi per PM`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={readOnly}
                      onClick={() => editCoupon(coupon)}
                    >
                      <Pencil size={16} />
                      Modifica
                    </button>
                    <button
                      className="btn border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        setDeleteError("");
                        setCouponToDelete(coupon);
                      }}
                    >
                      <Trash2 size={16} />
                      Elimina
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Metric
                    icon={Users}
                    label="PM"
                    value={coupon.stats.uniqueProfiles.toString()}
                  />
                  <Metric
                    icon={BadgePercent}
                    label="Utilizzi"
                    value={coupon.stats.redeemedCount.toString()}
                  />
                  <Metric
                    icon={CircleDollarSign}
                    label="Ricariche"
                    value={formatCurrencyCents(coupon.stats.paidAmountCents)}
                  />
                  <Metric
                    icon={Plus}
                    label="Bonus erogato"
                    value={formatCurrencyCents(coupon.stats.bonusAmountCents)}
                  />
                  <Metric
                    icon={CalendarDays}
                    label="Prenotati"
                    value={coupon.stats.pendingCount.toString()}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {coupon.tiers.map((tier) => (
                    <span
                      className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                      key={tier.id}
                    >
                      Da {formatCurrencyCents(tier.minPaidCents)}: +
                      {formatCurrencyCents(tier.bonusCents)}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {couponToDelete ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center"
          role="presentation"
        >
          <section
            aria-labelledby="delete-coupon-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker text-red-700">Conferma richiesta</p>
                <h2
                  className="mt-2 text-xl font-semibold text-ink"
                  id="delete-coupon-title"
                >
                  Eliminare il coupon?
                </h2>
              </div>
              <button
                aria-label="Chiudi conferma eliminazione"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleteError("");
                  setCouponToDelete(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">
              Stai per eliminare definitivamente{" "}
              <strong>{couponToDelete.name}</strong>, codice{" "}
              <strong className="font-mono">{couponToDelete.code}</strong>, e
              tutte le relative fasce bonus.
            </p>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              Gli eventuali checkout Stripe aperti e non pagati verranno
              annullati. Un coupon che ha già erogato bonus non può essere
              eliminato e deve essere disattivato.
            </p>

            {deleteError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold leading-6 text-red-700">
                {deleteError}
              </p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                className="btn btn-secondary w-full"
                type="button"
                disabled={deleting}
                onClick={() => {
                  setDeleteError("");
                  setCouponToDelete(null);
                }}
              >
                Annulla
              </button>
              <button
                className="btn w-full bg-red-600 text-white hover:bg-red-700"
                type="button"
                disabled={deleting}
                onClick={deleteCoupon}
              >
                <Trash2 size={17} />
                {deleting ? "Eliminazione..." : "Elimina definitivamente"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
      {label}
      {children}
    </label>
  );
}

function CurrencyInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold text-slate-600">
      {label}
      <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 focus-within:border-green">
        <span className="mr-2 text-slate-400">€</span>
        <input
          className="w-full bg-transparent text-sm text-ink outline-none"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function Toggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <input
        className="mt-1 size-4 accent-green"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted">
          {description}
        </span>
      </span>
    </label>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BadgePercent;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Icon size={15} />
        {label}
      </div>
      <p className="mt-2 font-semibold text-ink">{value}</p>
    </div>
  );
}

function currencyToCents(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function nullableCurrencyCents(value: string) {
  return value.trim() ? currencyToCents(value) : null;
}

function nullableInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function centsToInput(value: number | null) {
  if (value === null) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

function toIsoDate(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
