import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { getManagedPropertiesLabel } from "@/lib/domain/pm-onboarding";

const managedPropertiesValues = [
  "starting_now",
  "one_to_three",
  "four_to_ten",
  "more_than_ten",
  "not_indicated",
] as const;

const exportColumns = [
  "name",
  "email",
  "phone",
  "accountStatus",
  "registeredAt",
  "lastSignInAt",
  "emailConfirmedAt",
  "primaryCity",
  "managedProperties",
  "marketingConsent",
  "marketingConsentAt",
  "walletBalance",
  "topUpsCount",
  "topUpsTotal",
  "firstTopUpAt",
  "lastTopUpAt",
  "leadPurchasesCount",
  "sharedLeadPurchasesCount",
  "exclusiveLeadPurchasesCount",
  "leadPurchasesTotal",
  "firstLeadPurchaseAt",
  "lastLeadPurchaseAt",
  "walletCreditsTotal",
  "marketingAddonStatus",
  "primeStatus",
  "primeExpiresAt",
] as const;

const exportSchema = z.object({
  scope: z.enum(["all", "filtered"]),
  search: z.string().max(120).optional().default(""),
  managedProperties: z.enum([...managedPropertiesValues]).optional(),
  columns: z.array(z.enum(exportColumns)).min(1).max(exportColumns.length),
});

type ProfileRow = {
  id: string;
  auth_user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: "active" | "suspended";
  created_at: string;
};

type PropertyManagerProfileRow = {
  profile_id: string;
  managed_properties_count: number | null;
  managed_properties_range: string | null;
  primary_city: string | null;
};

type WalletTransactionRow = {
  profile_id: string;
  type: "top_up" | "lead_purchase" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "cancelled";
  amount_cents: number;
  created_at: string;
  completed_at: string | null;
};

type LeadPurchaseRow = {
  property_manager_id: string;
  amount_cents: number;
  mode: "shared" | "exclusive";
  status: string;
  created_at: string;
};

type AuthMetadata = {
  managed_properties_range?: string;
  primary_city?: string;
};

type AuthUser = {
  id: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: AuthMetadata | null;
};

const columnDefinitions: Record<(typeof exportColumns)[number], { header: string }> = {
  name: { header: "Nome e cognome" },
  email: { header: "Email" },
  phone: { header: "Telefono" },
  accountStatus: { header: "Stato account" },
  registeredAt: { header: "Data iscrizione" },
  lastSignInAt: { header: "Ultimo accesso" },
  emailConfirmedAt: { header: "Email confermata il" },
  primaryCity: { header: "Città principale" },
  managedProperties: { header: "Immobili gestiti" },
  marketingConsent: { header: "Consenso marketing" },
  marketingConsentAt: { header: "Consenso marketing dal" },
  walletBalance: { header: "Saldo Wallet (€)" },
  topUpsCount: { header: "Numero ricariche Wallet" },
  topUpsTotal: { header: "Totale ricariche Wallet (€)" },
  firstTopUpAt: { header: "Prima ricarica" },
  lastTopUpAt: { header: "Ultima ricarica" },
  leadPurchasesCount: { header: "Lead acquistati" },
  sharedLeadPurchasesCount: { header: "Lead condivisi acquistati" },
  exclusiveLeadPurchasesCount: { header: "Lead esclusivi acquistati" },
  leadPurchasesTotal: { header: "Spesa Lead (€)" },
  firstLeadPurchaseAt: { header: "Primo Lead acquistato" },
  lastLeadPurchaseAt: { header: "Ultimo Lead acquistato" },
  walletCreditsTotal: { header: "Riaccrediti e bonus Wallet (€)" },
  marketingAddonStatus: { header: "Modulo Marketing" },
  primeStatus: { header: "Stato PRIME" },
  primeExpiresAt: { header: "Scadenza PRIME" },
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile: actor, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = exportSchema.parse(await request.json());
    const search = normalizeSearchTerm(payload.search);

    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("profile_id")
      .eq("role", "property_manager");
    if (rolesError) throw rolesError;

    const allProfileIds = Array.from(
      new Set((roleRows ?? []).map((item) => item.profile_id).filter(Boolean)),
    );
    const profileIds =
      payload.scope === "filtered"
        ? await resolveFilteredPropertyManagerIds({
            supabase,
            allProfileIds,
            search,
            managedPropertiesFilter: payload.managedProperties,
          })
        : allProfileIds;

    if (!profileIds.length) {
      return buildCsvResponse([], payload.columns);
    }

    const [
      { data: profiles, error: profilesError },
      { data: pmProfiles, error: pmProfilesError },
      { data: wallets, error: walletsError },
      { data: preferences, error: preferencesError },
      { data: transactions, error: transactionsError },
      { data: addonProducts, error: addonProductsError },
      { data: primeAccounts, error: primeAccountsError },
      { data: authUsersData, error: authUsersError },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,auth_user_id,email,first_name,last_name,phone,status,created_at")
        .in("id", profileIds),
      supabase
        .from("property_manager_profiles")
        .select("id,profile_id,managed_properties_count,managed_properties_range,primary_city")
        .in("profile_id", profileIds),
      supabase.from("wallets").select("profile_id,balance_cents").in("profile_id", profileIds),
      supabase
        .from("pm_marketing_preferences")
        .select("profile_id,status,granted_at")
        .in("profile_id", profileIds),
      supabase
        .from("wallet_transactions")
        .select("profile_id,type,status,amount_cents,created_at,completed_at")
        .in("profile_id", profileIds),
      supabase.from("addon_products").select("id,slug").eq("slug", "marketing"),
      supabase
        .from("prime_accounts")
        .select("profile_id,status,prime_expires_at")
        .in("profile_id", profileIds),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesError) throw profilesError;
    if (pmProfilesError) throw pmProfilesError;
    if (walletsError) throw walletsError;
    if (preferencesError) throw preferencesError;
    if (transactionsError) throw transactionsError;
    if (addonProductsError) throw addonProductsError;
    if (primeAccountsError) throw primeAccountsError;
    if (authUsersError) throw authUsersError;

    const marketingProductId = addonProducts?.[0]?.id;
    const { data: marketingSubscriptions, error: marketingSubscriptionsError } = marketingProductId
      ? await supabase
          .from("addon_subscriptions")
          .select("profile_id,status,current_period_ends_at,trial_ends_at")
          .eq("addon_product_id", marketingProductId)
          .in("profile_id", profileIds)
      : { data: [], error: null };
    if (marketingSubscriptionsError) throw marketingSubscriptionsError;

    const pmProfilesById = new Map(
      ((pmProfiles ?? []) as PropertyManagerProfileRow[]).map((row) => [row.profile_id, row]),
    );
    const walletsById = new Map(
      (wallets ?? []).map((row) => [row.profile_id, row.balance_cents]),
    );
    const preferencesById = new Map(
      (preferences ?? []).map((row) => [row.profile_id, row]),
    );
    const marketingSubscriptionsById = new Map(
      (marketingSubscriptions ?? []).map((row) => [row.profile_id, row]),
    );
    const primeAccountsById = new Map(
      (primeAccounts ?? []).map((row) => [row.profile_id, row]),
    );
    const authUsersById = new Map(
      ((authUsersData?.users ?? []) as AuthUser[]).map((user) => [user.id, user]),
    );
    const purchasesByPmId = new Map<string, LeadPurchaseRow[]>();
    const transactionsByProfileId = new Map<string, WalletTransactionRow[]>();

    const pmProfileIdByProfileId = new Map(
      ((pmProfiles ?? []) as Array<{ id?: string; profile_id: string }>).map((row) => [
        row.profile_id,
        row.id,
      ]),
    );
    const propertyManagerIds = Array.from(pmProfileIdByProfileId.values()).filter(
      (value): value is string => Boolean(value),
    );
    const { data: purchases, error: purchasesError } = propertyManagerIds.length
      ? await supabase
          .from("lead_purchases")
          .select("property_manager_id,amount_cents,mode,status,created_at")
          .in("property_manager_id", propertyManagerIds)
      : { data: [], error: null };
    if (purchasesError) throw purchasesError;

    for (const purchase of (purchases ?? []) as LeadPurchaseRow[]) {
      const rows = purchasesByPmId.get(purchase.property_manager_id) ?? [];
      rows.push(purchase);
      purchasesByPmId.set(purchase.property_manager_id, rows);
    }
    for (const transaction of (transactions ?? []) as WalletTransactionRow[]) {
      const rows = transactionsByProfileId.get(transaction.profile_id) ?? [];
      rows.push(transaction);
      transactionsByProfileId.set(transaction.profile_id, rows);
    }

    const rows = ((profiles ?? []) as ProfileRow[])
      .map((profile) => {
        const pmProfile = pmProfilesById.get(profile.id);
        const authUser = profile.auth_user_id ? authUsersById.get(profile.auth_user_id) : undefined;
        const metadata = authUser?.user_metadata ?? undefined;
        const managedPropertiesRange =
          pmProfile?.managed_properties_range ?? metadata?.managed_properties_range ?? null;
        const primaryCity = pmProfile?.primary_city ?? metadata?.primary_city ?? "";
        const completedTopUps = (transactionsByProfileId.get(profile.id) ?? [])
          .filter((transaction) => transaction.type === "top_up" && transaction.status === "completed")
          .sort((a, b) => Date.parse(a.completed_at ?? a.created_at) - Date.parse(b.completed_at ?? b.created_at));
        const credits = (transactionsByProfileId.get(profile.id) ?? [])
          .filter(
            (transaction) =>
              transaction.status === "completed" &&
              ["refund", "adjustment"].includes(transaction.type) &&
              transaction.amount_cents > 0,
          )
          .reduce((total, transaction) => total + transaction.amount_cents, 0);
        const pmId = pmProfileIdByProfileId.get(profile.id);
        const completedPurchases = (pmId ? purchasesByPmId.get(pmId) ?? [] : [])
          .filter((purchase) => ["paid", "contact_unlocked"].includes(purchase.status))
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
        const preference = preferencesById.get(profile.id);
        const marketingSubscription = marketingSubscriptionsById.get(profile.id);
        const primeAccount = primeAccountsById.get(profile.id);

        return {
          name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Non indicato",
          email: profile.email,
          phone: profile.phone ?? "",
          accountStatus: profile.status === "suspended" ? "Sospeso" : "Attivo",
          registeredAt: formatDate(profile.created_at),
          lastSignInAt: formatDate(authUser?.last_sign_in_at ?? null),
          emailConfirmedAt: formatDate(authUser?.email_confirmed_at ?? null),
          primaryCity: primaryCity || "Non indicata",
          managedProperties: getManagedPropertiesLabel(
            managedPropertiesRange,
            pmProfile?.managed_properties_count,
          ),
          marketingConsent: preference?.status === "granted" ? "Concesso" : "Non concesso",
          marketingConsentAt: formatDate(preference?.granted_at ?? null),
          walletBalance: formatCurrency(walletsById.get(profile.id) ?? 0),
          topUpsCount: String(completedTopUps.length),
          topUpsTotal: formatCurrency(
            completedTopUps.reduce((total, transaction) => total + transaction.amount_cents, 0),
          ),
          firstTopUpAt: formatDate(completedTopUps[0]?.completed_at ?? completedTopUps[0]?.created_at ?? null),
          lastTopUpAt: formatDate(
            completedTopUps.at(-1)?.completed_at ?? completedTopUps.at(-1)?.created_at ?? null,
          ),
          leadPurchasesCount: String(completedPurchases.length),
          sharedLeadPurchasesCount: String(
            completedPurchases.filter((purchase) => purchase.mode === "shared").length,
          ),
          exclusiveLeadPurchasesCount: String(
            completedPurchases.filter((purchase) => purchase.mode === "exclusive").length,
          ),
          leadPurchasesTotal: formatCurrency(
            completedPurchases.reduce((total, purchase) => total + purchase.amount_cents, 0),
          ),
          firstLeadPurchaseAt: formatDate(completedPurchases[0]?.created_at ?? null),
          lastLeadPurchaseAt: formatDate(completedPurchases.at(-1)?.created_at ?? null),
          walletCreditsTotal: formatCurrency(credits),
          marketingAddonStatus: formatAddonStatus(marketingSubscription?.status ?? null),
          primeStatus: formatPrimeStatus(primeAccount?.status ?? null),
          primeExpiresAt: formatDate(primeAccount?.prime_expires_at ?? null),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "it-IT"));

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: actor.id,
      isSuperAdmin,
      entityType: "property_manager_export",
      action: "downloaded",
      after: {
        scope: payload.scope,
        columns: payload.columns,
        rowCount: rows.length,
      },
    });

    return buildCsvResponse(rows, payload.columns);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function normalizeSearchTerm(value: string) {
  return value
    .trim()
    .slice(0, 120)
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ");
}

async function resolveFilteredPropertyManagerIds({
  supabase,
  allProfileIds,
  search,
  managedPropertiesFilter,
}: {
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"];
  allProfileIds: string[];
  search: string;
  managedPropertiesFilter: (typeof managedPropertiesValues)[number] | undefined;
}) {
  if (!search && !managedPropertiesFilter) return allProfileIds;

  const [profilesResult, pmProfilesResult, authUsersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,auth_user_id,email,first_name,last_name,phone")
      .in("id", allProfileIds),
    supabase
      .from("property_manager_profiles")
      .select("profile_id,managed_properties_range,primary_city")
      .in("profile_id", allProfileIds),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (pmProfilesResult.error) throw pmProfilesResult.error;
  if (authUsersResult.error) throw authUsersResult.error;

  const pmProfilesById = new Map(
    (pmProfilesResult.data ?? []).map((row) => [row.profile_id, row]),
  );
  const authUsersById = new Map(
    ((authUsersResult.data.users ?? []) as AuthUser[]).map((user) => [user.id, user]),
  );
  const normalizedSearch = search.toLocaleLowerCase("it-IT");

  return (profilesResult.data ?? [])
    .filter((profile) => {
      const pmProfile = pmProfilesById.get(profile.id);
      const metadata = profile.auth_user_id
        ? authUsersById.get(profile.auth_user_id)?.user_metadata
        : undefined;
      const effectiveRange =
        pmProfile?.managed_properties_range ?? metadata?.managed_properties_range ?? null;
      const effectiveCity = pmProfile?.primary_city ?? metadata?.primary_city ?? "";
      const matchesSearch =
        !normalizedSearch ||
        [
          profile.first_name,
          profile.last_name,
          [profile.first_name, profile.last_name].filter(Boolean).join(" "),
          profile.email,
          profile.phone,
          effectiveCity,
        ].some((value) => value?.toLocaleLowerCase("it-IT").includes(normalizedSearch));
      const matchesManagedProperties =
        !managedPropertiesFilter ||
        (managedPropertiesFilter === "not_indicated"
          ? !effectiveRange
          : effectiveRange === managedPropertiesFilter);
      return matchesSearch && matchesManagedProperties;
    })
    .map((profile) => profile.id);
}

function buildCsvResponse(
  rows: Array<Record<(typeof exportColumns)[number], string>>,
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
      "Content-Disposition": `attachment; filename=lead-host-property-manager-${date}.csv`,
      "Cache-Control": "no-store",
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

function formatAddonStatus(status: string | null) {
  const labels: Record<string, string> = {
    trialing: "Prova gratuita",
    active: "Attivo",
    past_due: "Pagamento da regolarizzare",
    canceled: "Cancellato",
    expired: "Scaduto",
    incomplete: "In attivazione",
  };
  return status ? labels[status] ?? status : "Non attivo";
}

function formatPrimeStatus(status: string | null) {
  const labels: Record<string, string> = {
    active: "Attivo",
    past_due: "Pagamento da regolarizzare",
    suspended: "Sospeso",
    cancelled: "Cancellato",
    inactive: "Non attivo",
  };
  return status ? labels[status] ?? status : "Non attivo";
}
