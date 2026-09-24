import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireAdminPermission,
} from "@/lib/admin/auth";
import { getManagedPropertiesLabel } from "@/lib/domain/pm-onboarding";
import {
  isPrimeSubscriber,
  matchesPrimeSubscriberStatus,
} from "@/lib/prime/subscriber-reporting";
import { readRowsInIdBatches } from "@/lib/supabase/batched-query";

const managedPropertiesValues = [
  "starting_now",
  "one_to_three",
  "four_to_ten",
  "more_than_ten",
  "not_indicated",
] as const;

const subscriberStatuses = [
  "all",
  "active",
  "expiring",
  "canceling",
  "attention",
  "cancelled",
] as const;

const exportColumns = [
  "name",
  "email",
  "phone",
  "accountStatus",
  "primaryCity",
  "interestLocations",
  "managedProperties",
  "walletBalance",
  "accountManager",
  "primeStatus",
  "paymentStatus",
  "accessSource",
  "primeStartedAt",
  "renewalOrExpiryAt",
  "cancelAtPeriodEnd",
  "canceledAt",
  "totalPaid",
  "paymentCount",
  "lastPaymentAt",
] as const;

const exportSchema = z.object({
  scope: z.enum(["all", "filtered"]),
  search: z.string().max(120).optional().default(""),
  managedProperties: z.enum(managedPropertiesValues).optional(),
  subscriberStatus: z.enum(subscriberStatuses).optional().default("all"),
  subscriberManagerId: z.string().uuid().optional(),
  columns: z.array(z.enum(exportColumns)).min(1).max(exportColumns.length),
});

type PrimeAccountRow = {
  id: string;
  profile_id: string;
  addon_subscription_id: string | null;
  account_manager_member_id: string | null;
  status: "inactive" | "active" | "past_due" | "suspended" | "cancelled";
  access_source: "none" | "stripe" | "manual";
  prime_started_at: string | null;
  prime_expires_at: string | null;
  grace_ends_at: string | null;
  payment_status: string;
};

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: "active" | "suspended";
};

type PmProfileRow = {
  profile_id: string;
  primary_city: string | null;
  managed_properties_range: string | null;
  managed_properties_count: number | null;
};

type SubscriptionRow = {
  id: string;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

type BillingRow = {
  profile_id: string;
  status: string;
  total_amount_cents: number;
  paid_at: string | null;
};

type ExportRow = Record<(typeof exportColumns)[number], string>;

const columnDefinitions: Record<(typeof exportColumns)[number], { header: string }> = {
  name: { header: "Nome e cognome" },
  email: { header: "Email" },
  phone: { header: "Telefono" },
  accountStatus: { header: "Stato account Lead Host" },
  primaryCity: { header: "Citta principale" },
  interestLocations: { header: "Localita d'interesse" },
  managedProperties: { header: "Immobili gestiti" },
  walletBalance: { header: "Saldo Wallet (EUR)" },
  accountManager: { header: "Account Manager" },
  primeStatus: { header: "Stato PRIME" },
  paymentStatus: { header: "Stato pagamento" },
  accessSource: { header: "Tipo di attivazione" },
  primeStartedAt: { header: "Data attivazione PRIME" },
  renewalOrExpiryAt: { header: "Prossimo rinnovo o scadenza" },
  cancelAtPeriodEnd: { header: "Disdetta programmata" },
  canceledAt: { header: "Data disdetta" },
  totalPaid: { header: "Totale pagato (EUR)" },
  paymentCount: { header: "Numero pagamenti" },
  lastPaymentAt: { header: "Ultimo pagamento" },
};

export async function POST(request: NextRequest) {
  try {
    const context = await requireAdminPermission(request, "prime", "read");
    const { supabase, isSuperAdmin, teamMemberId } = context;
    const payload = exportSchema.parse(await request.json());

    if (!isSuperAdmin && !teamMemberId) {
      throw new AdminApiError(403, "Portafoglio PRIME non disponibile.");
    }

    const accounts = await readAllRows<PrimeAccountRow>((from, to) => {
      let query = supabase
        .from("prime_accounts")
        .select("id,profile_id,addon_subscription_id,account_manager_member_id,status,access_source,prime_started_at,prime_expires_at,grace_ends_at,payment_status")
        .neq("access_source", "none")
        .not("prime_started_at", "is", null)
        .order("id")
        .range(from, to);

      if (!isSuperAdmin) {
        query = query.eq("account_manager_member_id", teamMemberId as string);
      } else if (payload.scope === "filtered" && payload.subscriberManagerId) {
        query = query.eq("account_manager_member_id", payload.subscriberManagerId);
      }
      return query;
    });

    const subscriberAccounts = accounts.filter((account) => isPrimeSubscriber(account));
    const profileIds = subscriberAccounts.map((account) => account.profile_id);
    if (!profileIds.length) {
      await auditExport({
        context,
        request,
        scope: payload.scope,
        columns: payload.columns,
        rowCount: 0,
      });
      return buildCsvResponse([], payload.columns);
    }

    const subscriptionIds = subscriberAccounts
      .map((account) => account.addon_subscription_id)
      .filter((id): id is string => Boolean(id));
    const managerIds = subscriberAccounts
      .map((account) => account.account_manager_member_id)
      .filter((id): id is string => Boolean(id));

    const [profiles, pmProfiles, wallets, internalNotes, subscriptions, billingPeriods, managers] =
      await Promise.all([
        readRowsInIdBatches<ProfileRow>(profileIds, (batch) => supabase
          .from("profiles")
          .select("id,email,first_name,last_name,phone,status")
          .in("id", batch)),
        readRowsInIdBatches<PmProfileRow>(profileIds, (batch) => supabase
          .from("property_manager_profiles")
          .select("profile_id,primary_city,managed_properties_range,managed_properties_count")
          .in("profile_id", batch)),
        readRowsInIdBatches<{ profile_id: string; balance_cents: number }>(profileIds, (batch) => supabase
          .from("wallets")
          .select("profile_id,balance_cents")
          .in("profile_id", batch)),
        readRowsInIdBatches<{ profile_id: string; interest_locations: string[] }>(profileIds, (batch) => supabase
          .from("prime_internal_notes")
          .select("profile_id,interest_locations")
          .in("profile_id", batch)),
        subscriptionIds.length
          ? readRowsInIdBatches<SubscriptionRow>(subscriptionIds, (batch) => supabase
              .from("addon_subscriptions")
              .select("id,current_period_ends_at,cancel_at_period_end,canceled_at")
              .in("id", batch))
          : Promise.resolve([]),
        readRowsInIdBatches<BillingRow>(profileIds, (batch) => supabase
          .from("prime_billing_periods")
          .select("profile_id,status,total_amount_cents,paid_at")
          .in("profile_id", batch)),
        managerIds.length
          ? readRowsInIdBatches<{ id: string; profile_id: string }>(managerIds, (batch) => supabase
              .from("team_members")
              .select("id,profile_id")
              .in("id", batch))
          : Promise.resolve([]),
      ]);

    const managerProfileIds = managers.map((manager) => manager.profile_id);
    const managerProfiles = managerProfileIds.length
      ? await readRowsInIdBatches<{
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
        }>(managerProfileIds, (batch) => supabase
          .from("profiles")
          .select("id,email,first_name,last_name")
          .in("id", batch))
      : [];

    const profilesById = new Map(profiles.map((row) => [row.id, row]));
    const pmProfilesById = new Map(pmProfiles.map((row) => [row.profile_id, row]));
    const walletsById = new Map(wallets.map((row) => [row.profile_id, row.balance_cents]));
    const locationsById = new Map(
      internalNotes.map((row) => [row.profile_id, row.interest_locations ?? []]),
    );
    const subscriptionsById = new Map(subscriptions.map((row) => [row.id, row]));
    const managerProfilesById = new Map(managerProfiles.map((row) => [row.id, row]));
    const managerNamesById = new Map(
      managers.map((manager) => {
        const profile = managerProfilesById.get(manager.profile_id);
        return [
          manager.id,
          [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
            profile?.email ||
            "Account Manager",
        ];
      }),
    );
    const billingByProfileId = new Map<string, BillingRow[]>();
    for (const period of billingPeriods) {
      const rows = billingByProfileId.get(period.profile_id) ?? [];
      rows.push(period);
      billingByProfileId.set(period.profile_id, rows);
    }

    const search = normalizeSearch(payload.scope === "filtered" ? payload.search : "");
    const filteredRows = subscriberAccounts
      .map((account) => {
        const profile = profilesById.get(account.profile_id);
        if (!profile) return null;
        const pmProfile = pmProfilesById.get(account.profile_id) ?? null;
        const subscription = account.addon_subscription_id
          ? subscriptionsById.get(account.addon_subscription_id) ?? null
          : null;
        const interestLocations = locationsById.get(account.profile_id) ?? [];
        return { account, profile, pmProfile, subscription, interestLocations };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .filter((row) => {
        if (payload.scope !== "filtered") return true;
        if (!matchesSearch(row, search)) return false;
        if (!matchesManagedProperties(row.pmProfile, payload.managedProperties)) return false;
        return matchesPrimeSubscriberStatus(row, payload.subscriberStatus);
      })
      .sort((left, right) => profileName(left.profile).localeCompare(profileName(right.profile), "it-IT"));

    const rows: ExportRow[] = filteredRows.map((row) => {
      const paidPeriods = (billingByProfileId.get(row.profile.id) ?? [])
        .filter((period) => period.status === "paid")
        .sort((left, right) => Date.parse(left.paid_at ?? "") - Date.parse(right.paid_at ?? ""));
      const renewalOrExpiryAt =
        row.subscription?.current_period_ends_at ?? row.account.prime_expires_at;

      return {
        name: profileName(row.profile),
        email: row.profile.email,
        phone: row.profile.phone ?? "",
        accountStatus: row.profile.status === "suspended" ? "Sospeso" : "Attivo",
        primaryCity: row.pmProfile?.primary_city || "Non indicata",
        interestLocations: row.interestLocations.join(", ") || "Non indicate",
        managedProperties: getManagedPropertiesLabel(
          row.pmProfile?.managed_properties_range,
          row.pmProfile?.managed_properties_count,
        ),
        walletBalance: formatCurrency(walletsById.get(row.profile.id) ?? 0),
        accountManager: row.account.account_manager_member_id
          ? managerNamesById.get(row.account.account_manager_member_id) ?? "Non indicato"
          : "Non assegnato",
        primeStatus: formatPrimeStatus(row.account.status),
        paymentStatus: formatPaymentStatus(row.account.payment_status),
        accessSource: row.account.access_source === "manual" ? "Accesso manuale" : "Stripe",
        primeStartedAt: formatDate(row.account.prime_started_at),
        renewalOrExpiryAt: formatDate(renewalOrExpiryAt),
        cancelAtPeriodEnd: row.subscription?.cancel_at_period_end ? "Si" : "No",
        canceledAt: formatDate(row.subscription?.canceled_at),
        totalPaid: formatCurrency(
          paidPeriods.reduce((total, period) => total + period.total_amount_cents, 0),
        ),
        paymentCount: String(paidPeriods.length),
        lastPaymentAt: formatDate(paidPeriods.at(-1)?.paid_at),
      };
    });

    await auditExport({
      context,
      request,
      scope: payload.scope,
      columns: payload.columns,
      rowCount: rows.length,
    });

    return buildCsvResponse(rows, payload.columns);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Esportazione PRIME non valida." },
        { status: 422 },
      );
    }
    return adminApiErrorResponse(error);
  }
}

function matchesSearch(
  row: {
    profile: ProfileRow;
    pmProfile: PmProfileRow | null;
    interestLocations: string[];
  },
  search: string,
) {
  if (!search) return true;
  return [
    row.profile.first_name,
    row.profile.last_name,
    profileName(row.profile),
    row.profile.email,
    row.profile.phone,
    row.pmProfile?.primary_city,
    ...row.interestLocations,
  ].some((value) => value?.toLocaleLowerCase("it-IT").includes(search));
}

function matchesManagedProperties(
  pmProfile: PmProfileRow | null,
  filter: (typeof managedPropertiesValues)[number] | undefined,
) {
  if (!filter) return true;
  const range = pmProfile?.managed_properties_range ?? null;
  const count = pmProfile?.managed_properties_count ?? null;
  if (filter === "not_indicated") return !range && count === null;
  if (range) return range === filter;
  if (filter === "starting_now") return count === 0;
  if (filter === "one_to_three") return count !== null && count >= 1 && count <= 3;
  if (filter === "four_to_ten") return count !== null && count >= 4 && count <= 10;
  return count !== null && count > 10;
}

function normalizeSearch(value: string) {
  return value.trim().slice(0, 120).toLocaleLowerCase("it-IT");
}

function profileName(profile: Pick<ProfileRow, "first_name" | "last_name" | "email">) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
}

async function readAllRows<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await load(from, from + 499);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

async function auditExport({
  context,
  request,
  scope,
  columns,
  rowCount,
}: {
  context: Awaited<ReturnType<typeof requireAdminPermission>>;
  request: NextRequest;
  scope: "all" | "filtered";
  columns: Array<(typeof exportColumns)[number]>;
  rowCount: number;
}) {
  await writeAdminAuditLog({
    supabase: context.supabase,
    request,
    actorProfileId: context.profile.id,
    isSuperAdmin: context.isSuperAdmin,
    entityType: "prime_subscriber_export",
    action: "downloaded",
    after: {
      scope,
      columns,
      rowCount,
      portfolioRestricted: !context.isSuperAdmin,
      teamMemberId: context.teamMemberId,
    },
  });
}

function buildCsvResponse(
  rows: ExportRow[],
  columns: Array<(typeof exportColumns)[number]>,
) {
  const csv = [
    columns.map((column) => csvCell(columnDefinitions[column].header)).join(";"),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(";")),
  ].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=lead-host-abbonati-prime-${date}.csv`,
      "Cache-Control": "private, no-store",
    },
  });
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function formatPrimeStatus(status: string) {
  return ({
    active: "Attivo",
    past_due: "Pagamento da gestire",
    suspended: "Sospeso",
    cancelled: "Cancellato",
    inactive: "Non attivo",
  } as Record<string, string>)[status] ?? status;
}

function formatPaymentStatus(status: string) {
  return ({
    not_applicable: "Non applicabile",
    pending: "In attesa",
    trialing: "In prova",
    paid: "Pagato",
    past_due: "Pagamento da gestire",
    unpaid: "Non pagato",
    cancelled: "Cancellato",
  } as Record<string, string>)[status] ?? status;
}
