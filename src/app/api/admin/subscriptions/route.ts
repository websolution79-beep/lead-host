import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { readAllReportRows, subscriptionReportingPrice } from "@/lib/marketplace-membership/reporting";

const productFilterSchema = z.enum(["all", "lead-host-prime", "marketing", "marketplace"]);
const statusFilterSchema = z.enum([
  "all", "active", "trialing", "past_due", "cancel_at_period_end", "canceled",
]);

type ProductSlug = Exclude<z.infer<typeof productFilterSchema>, "all">;

type SubscriptionRow = {
  id: string;
  addon_product_id: string;
  profile_id: string;
  status: string;
  source: "stripe" | "manual";
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_started_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  access_expires_at: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type ProductRow = {
  id: string;
  slug: ProductSlug;
  name: string;
  sale_price_cents: number | null;
  currency: string;
};

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
};

type PrimeAccountRow = {
  profile_id: string;
  addon_subscription_id: string | null;
  access_source: "none" | "stripe" | "manual";
  status: string;
  account_manager_member_id: string | null;
  prime_started_at: string | null;
  prime_expires_at: string | null;
  grace_ends_at: string | null;
};

type TeamMemberRow = { id: string; profile_id: string };

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const productFilter = productFilterSchema.catch("all").parse(
      request.nextUrl.searchParams.get("product") ?? "all",
    );
    const statusFilter = statusFilterSchema.catch("all").parse(
      request.nextUrl.searchParams.get("status") ?? "all",
    );
    const search = (request.nextUrl.searchParams.get("search") ?? "").trim().toLocaleLowerCase("it-IT");
    const dateFrom = parseDate(request.nextUrl.searchParams.get("dateFrom"));
    const dateTo = parseDate(request.nextUrl.searchParams.get("dateTo"));
    const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const pageSize = 25;

    const productsResult = await supabase.from("addon_products")
      .select("id,slug,name,sale_price_cents,currency")
      .in("slug", ["lead-host-prime", "marketing", "marketplace"]);
    if (productsResult.error) throw productsResult.error;
    const products = (productsResult.data ?? []) as ProductRow[];
    const productsById = new Map(products.map((product) => [product.id, product]));
    const productIds = products.map((product) => product.id);
    if (!productIds.length) {
      return NextResponse.json(emptyResponse(page, pageSize));
    }

    const subscriptionsResult = await readAllReportRows((from, to) => supabase
      .from("addon_subscriptions")
      .select("id,addon_product_id,profile_id,status,source,trial_started_at,trial_ends_at,current_period_started_at,current_period_ends_at,cancel_at_period_end,canceled_at,access_expires_at,metadata,created_at,updated_at")
      .in("addon_product_id", productIds)
      .order("updated_at", { ascending: false })
      .range(from, to));
    const latestSubscriptions = latestByProfileAndProduct(
      (subscriptionsResult.data as SubscriptionRow[]).filter((row) => productsById.has(row.addon_product_id)),
    );
    const profileIds = [...new Set(latestSubscriptions.map((row) => row.profile_id))];
    const [profilesResult, citiesResult, primeAccountsResult] = profileIds.length
      ? await Promise.all([
          supabase.from("profiles").select("id,email,first_name,last_name,status").in("id", profileIds),
          supabase.from("property_manager_profiles").select("profile_id,primary_city").in("profile_id", profileIds),
          supabase.from("prime_accounts").select("profile_id,addon_subscription_id,access_source,status,account_manager_member_id,prime_started_at,prime_expires_at,grace_ends_at").in("profile_id", profileIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (profilesResult.error) throw profilesResult.error;
    if (citiesResult.error) throw citiesResult.error;
    if (primeAccountsResult.error) throw primeAccountsResult.error;

    const accounts = (primeAccountsResult.data ?? []) as PrimeAccountRow[];
    const managerIds = [...new Set(accounts.map((row) => row.account_manager_member_id).filter(Boolean))] as string[];
    const membersResult = managerIds.length
      ? await supabase.from("team_members").select("id,profile_id").in("id", managerIds)
      : { data: [], error: null };
    if (membersResult.error) throw membersResult.error;
    const managerProfileIds = [...new Set(((membersResult.data ?? []) as TeamMemberRow[]).map((row) => row.profile_id))];
    const managerProfilesResult = managerProfileIds.length
      ? await supabase.from("profiles").select("id,first_name,last_name,email").in("id", managerProfileIds)
      : { data: [], error: null };
    if (managerProfilesResult.error) throw managerProfilesResult.error;

    const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
    const cityByProfileId = new Map((citiesResult.data ?? []).map((row) => [row.profile_id, row.primary_city]));
    const primeBySubscriptionId = new Map(accounts.filter((row) => row.addon_subscription_id).map((row) => [row.addon_subscription_id!, row]));
    const memberById = new Map(((membersResult.data ?? []) as TeamMemberRow[]).map((member) => [member.id, member]));
    const managerByProfileId = new Map((managerProfilesResult.data ?? []).map((profile) => [profile.id, profile]));
    // PRIME is counted only after the linked PRIME account has actually been activated.
    // This matches the Dashboard snapshot and excludes abandoned technical Stripe records.
    const activePrimeSubscriptionIds = new Set(accounts
      .filter((account) => account.access_source !== "none" && account.prime_started_at && account.addon_subscription_id)
      .map((account) => account.addon_subscription_id!));

    const now = new Date();
    const allRows = latestSubscriptions
      .map((subscription) => {
        const product = productsById.get(subscription.addon_product_id)!;
        const profile = profilesById.get(subscription.profile_id);
        if (!profile) return null;
        const primeAccount = product.slug === "lead-host-prime"
          ? primeBySubscriptionId.get(subscription.id) ?? null
          : null;
        const managerMember = primeAccount?.account_manager_member_id
          ? memberById.get(primeAccount.account_manager_member_id) ?? null
          : null;
        const managerProfile = managerMember ? managerByProfileId.get(managerMember.profile_id) ?? null : null;
        const state = resolveState(subscription, now);
        const nextDate = subscription.status === "trialing"
          ? subscription.trial_ends_at
          : subscription.current_period_ends_at ?? subscription.access_expires_at;
        return {
          id: subscription.id,
          profileId: profile.id,
          propertyManager: {
            name: displayName(profile), email: profile.email, city: cityByProfileId.get(profile.id) ?? null,
            accountStatus: profile.status,
          },
          product: { slug: product.slug, name: product.name },
          status: state,
          source: subscription.source,
          priceCents: subscriptionReportingPrice(product.slug, subscription.metadata, product.sale_price_cents),
          currency: product.currency,
          startedAt: subscription.trial_started_at ?? subscription.current_period_started_at ?? subscription.created_at,
          trialEndsAt: subscription.trial_ends_at,
          currentPeriodEndsAt: subscription.current_period_ends_at,
          nextDate,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at,
          accountManager: managerProfile ? { name: displayName(managerProfile), email: managerProfile.email } : null,
          prime: primeAccount ? {
            status: primeAccount.status,
            accessEndsAt: primeAccount.prime_expires_at,
            graceEndsAt: primeAccount.grace_ends_at,
          } : null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const stats = summarize(allRows, activePrimeSubscriptionIds);
    const rows = allRows
      .filter((row) => productFilter === "all" || row.product.slug === productFilter)
      .filter((row) => statusFilter === "all" || row.status.key === statusFilter)
      .filter((row) => !search || [row.propertyManager.name, row.propertyManager.email, row.propertyManager.city ?? "", row.accountManager?.name ?? ""]
        .some((value) => value.toLocaleLowerCase("it-IT").includes(search)))
      .filter((row) => matchesDateRange(row.nextDate, dateFrom, dateTo))
      .sort((left, right) => (left.nextDate ?? "9999-12-31").localeCompare(right.nextDate ?? "9999-12-31"));

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    return NextResponse.json({
      rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
      stats,
      pagination: { page: safePage, pageSize, total, totalPages },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function latestByProfileAndProduct(rows: SubscriptionRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.profile_id}:${row.addon_product_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveState(row: SubscriptionRow, now: Date) {
  if (row.cancel_at_period_end && ["active", "trialing", "past_due"].includes(row.status)) {
    return { key: "cancel_at_period_end", label: "Rinnovi disattivati", tone: "amber" };
  }
  if (row.status === "trialing" && row.trial_ends_at && Date.parse(row.trial_ends_at) > now.getTime()) {
    return { key: "trialing", label: "In prova", tone: "blue" };
  }
  if (row.status === "active") return { key: "active", label: "Attivo", tone: "green" };
  if (["past_due", "unpaid"].includes(row.status)) return { key: "past_due", label: "Pagamento da regolarizzare", tone: "red" };
  return { key: "canceled", label: "Scaduto o disdetto", tone: "slate" };
}

function summarize(
  rows: Array<{ id: string; product: { slug: ProductSlug }; status: { key: string } }>,
  activePrimeSubscriptionIds: Set<string>,
) {
  const byProduct = (slug: ProductSlug) => rows.filter((row) =>
    row.product.slug === slug
    && (slug !== "lead-host-prime" || activePrimeSubscriptionIds.has(row.id)));
  const metrics = (slug: ProductSlug) => {
    const productRows = byProduct(slug);
    return {
      total: productRows.length,
      active: productRows.filter((row) => row.status.key === "active").length,
      trialing: productRows.filter((row) => row.status.key === "trialing").length,
      cancelAtPeriodEnd: productRows.filter((row) => row.status.key === "cancel_at_period_end").length,
      pastDue: productRows.filter((row) => row.status.key === "past_due").length,
    };
  };
  return { prime: metrics("lead-host-prime"), marketing: metrics("marketing"), marketplace: metrics("marketplace") };
}

function matchesDateRange(value: string | null, from: string | null, to: string | null) {
  if (!from && !to) return true;
  if (!value) return false;
  const date = value.slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}

function parseDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function displayName(profile: { first_name: string | null; last_name: string | null; email: string }) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
}

function emptyResponse(page: number, pageSize: number) {
  const empty = { total: 0, active: 0, trialing: 0, cancelAtPeriodEnd: 0, pastDue: 0 };
  return { rows: [], stats: { prime: empty, marketing: empty, marketplace: empty }, pagination: { page, pageSize, total: 0, totalPages: 1 } };
}
