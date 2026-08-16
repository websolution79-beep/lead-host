import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { MarketplaceLead } from "@/lib/domain/sample-data";
import type { Database } from "@/lib/supabase/database.types";
import { unstable_cache } from "next/cache";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";
import {
  fetchEffectiveMarketplacePromotion,
  resolvePromotionalPrice,
  type MarketplacePromotion,
} from "@/lib/config/marketplace-promotions";

type ServiceClient = SupabaseClient<Database>;

type LeadRow = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  | "id"
  | "owner_request_id"
  | "property_id"
  | "title"
  | "internal_status"
  | "public_status"
  | "shared_slots_sold"
  | "shared_price_cents"
  | "exclusive_price_cents"
  | "exclusive_purchase_id"
  | "published_at"
  | "expires_at"
  | "visible_until"
  | "sold_at"
  | "sold_visible_until"
  | "visibility_mode"
  | "prime_target_property_manager_id"
  | "prime_access_started_at"
  | "prime_access_until"
  | "prime_access_expired_at"
  | "detail_view_count"
  | "created_at"
  | "updated_at"
>;
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type OwnerPublicContactRow = Pick<
  Database["public"]["Tables"]["owner_contacts"]["Row"],
  "precise_address"
>;
type OwnerRequestVerificationRow = Pick<
  Database["public"]["Tables"]["owner_requests"]["Row"],
  "id" | "owner_verified" | "subletting_available"
>;
const LEAD_SELECT_WITH_VIEWS =
  "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,sold_at,sold_visible_until,visibility_mode,prime_target_property_manager_id,prime_access_started_at,prime_access_until,prime_access_expired_at,detail_view_count,created_at,updated_at";
const LEGACY_LEAD_SELECT =
  "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,sold_at,sold_visible_until,visibility_mode,prime_target_property_manager_id,prime_access_started_at,prime_access_until,prime_access_expired_at,created_at,updated_at";

export type PrimeZoneLead = MarketplaceLead & {
  primeAccessStartedAt: string;
  primeAccessUntil: string;
};
export async function getPublishedMarketplaceLeads() {
  return getCachedPublishedMarketplaceLeads();
}

const getCachedPublishedMarketplaceLeads = unstable_cache(
  loadPublishedMarketplaceLeads,
  ["published-marketplace-leads"],
  {
    revalidate: 10,
    tags: [MARKETPLACE_LEADS_CACHE_TAG],
  },
);

async function loadPublishedMarketplaceLeads() {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  let { data: leads, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT_WITH_VIEWS)
    .eq("visibility_mode", "public")
    .not("published_at", "is", null)
    .or(buildMarketplaceVisibilityFilter(now))
    .order("published_at", { ascending: false });

  if (error && isMissingDetailViewCountColumnError(error)) {
    const fallback = await supabase
      .from("leads")
      .select(LEGACY_LEAD_SELECT)
      .eq("visibility_mode", "public")
      .not("published_at", "is", null)
      .or(buildMarketplaceVisibilityFilter(now))
      .order("published_at", { ascending: false });

    leads = (fallback.data ?? []).map((lead) => ({
      ...lead,
      detail_view_count: 0,
    }));
    error = fallback.error;
  }

  if (error) {
    console.error(error);
    return [];
  }

  const { promotion } = await fetchEffectiveMarketplacePromotion(supabase);

  return mapLeadRowsToMarketplace(supabase, leads ?? [], promotion);
}

export async function getPublishedMarketplaceLeadById(id: string) {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  let { data: lead, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT_WITH_VIEWS)
    .eq("id", id)
    .eq("visibility_mode", "public")
    .or(buildMarketplaceVisibilityFilter(now))
    .maybeSingle();

  if (error && isMissingDetailViewCountColumnError(error)) {
    const fallback = await supabase
      .from("leads")
      .select(LEGACY_LEAD_SELECT)
      .eq("id", id)
      .eq("visibility_mode", "public")
      .or(buildMarketplaceVisibilityFilter(now))
      .maybeSingle();

    lead = fallback.data
      ? { ...fallback.data, detail_view_count: 0 }
      : null;
    error = fallback.error;
  }

  if (
    error ||
    !lead ||
    !lead.published_at ||
    (lead.visible_until && lead.visible_until < now)
  ) {
    return null;
  }

  const { promotion } = await fetchEffectiveMarketplacePromotion(supabase);
  const [mappedLead] = await mapLeadRowsToMarketplace(supabase, [lead], promotion);

  return mappedLead ?? null;
}

export async function getPrimeZoneLeadsForProfile(profileId: string) {
  const supabase = createServiceSupabaseClient();
  const access = await resolvePrimePropertyManagerAccess(supabase, profileId);

  if (!access) return [];

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT_WITH_VIEWS)
    .eq("visibility_mode", "prime_private")
    .eq("prime_target_property_manager_id", access.propertyManagerId)
    .eq("internal_status", "available")
    .is("exclusive_purchase_id", null)
    .is("prime_access_expired_at", null)
    .lte("prime_access_started_at", now)
    .gt("prime_access_until", now)
    .order("prime_access_until", { ascending: true });

  if (error) throw error;

  const mapped = await mapLeadRowsToMarketplace(supabase, data ?? [], null);
  const rowsById = new Map((data ?? []).map((lead) => [lead.id, lead]));

  return mapped.flatMap((lead) => {
    const row = rowsById.get(lead.id);

    if (!row?.prime_access_started_at || !row.prime_access_until) return [];

    return [{
      ...lead,
      expiresAt: row.prime_access_until,
      primeAccessStartedAt: row.prime_access_started_at,
      primeAccessUntil: row.prime_access_until,
    } satisfies PrimeZoneLead];
  });
}

export async function getPrimeZoneLeadByIdForProfile(
  profileId: string,
  leadId: string,
) {
  const supabase = createServiceSupabaseClient();
  const access = await resolvePrimePropertyManagerAccess(supabase, profileId);

  if (!access) return null;

  const { data: authorized, error: authorizationError } = await supabase.rpc(
    "profile_can_access_prime_lead",
    {
      p_profile_id: profileId,
      p_lead_id: leadId,
      p_at: new Date().toISOString(),
    },
  );

  if (authorizationError || !authorized) return null;

  const { data: lead, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT_WITH_VIEWS)
    .eq("id", leadId)
    .eq("visibility_mode", "prime_private")
    .eq("prime_target_property_manager_id", access.propertyManagerId)
    .maybeSingle();

  if (error || !lead?.prime_access_started_at || !lead.prime_access_until) {
    return null;
  }

  const [mapped] = await mapLeadRowsToMarketplace(supabase, [lead], null);

  if (!mapped) return null;

  return {
    ...mapped,
    expiresAt: lead.prime_access_until,
    primeAccessStartedAt: lead.prime_access_started_at,
    primeAccessUntil: lead.prime_access_until,
  } satisfies PrimeZoneLead;
}

async function resolvePrimePropertyManagerAccess(
  supabase: ServiceClient,
  profileId: string,
) {
  const now = new Date().toISOString();
  const [propertyManagerResult, primeAccountResult] = await Promise.all([
    supabase
      .from("property_manager_profiles")
      .select("id")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("prime_accounts")
      .select("status,prime_expires_at,grace_ends_at")
      .eq("profile_id", profileId)
      .or(
        `and(status.eq.active,or(prime_expires_at.is.null,prime_expires_at.gt.${now})),and(status.eq.past_due,grace_ends_at.gt.${now})`,
      )
      .maybeSingle(),
  ]);

  if (
    propertyManagerResult.error ||
    primeAccountResult.error ||
    !propertyManagerResult.data ||
    !primeAccountResult.data
  ) {
    return null;
  }

  return {
    propertyManagerId: propertyManagerResult.data.id,
    expiresAt: primeAccountResult.data.prime_expires_at,
  };
}

function buildMarketplaceVisibilityFilter(now: string) {
  return [
    `and(internal_status.in.(available,one_slot_sold),expires_at.gt.${now})`,
    `and(internal_status.eq.withdrawn_after_7_days,visible_until.gte.${now})`,
    `and(internal_status.in.(sold_two_pm,sold_exclusive),sold_visible_until.gte.${now})`,
  ].join(",");
}

async function mapLeadRowsToMarketplace(
  supabase: ServiceClient,
  leads: LeadRow[],
  promotion: MarketplacePromotion | null,
) {
  const propertyIds = Array.from(new Set(leads.map((lead) => lead.property_id)));
  const ownerRequestIds = Array.from(new Set(leads.map((lead) => lead.owner_request_id)));

  if (propertyIds.length === 0) {
    return [];
  }

  const [propertiesResult, contactsResult, requestsResult] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id,region,province,city,district,property_type,bedrooms,bathrooms,beds,approximate_area_sqm,timing,description,requested_services",
      )
      .in("id", propertyIds),
    supabase
      .from("owner_contacts")
      .select("owner_request_id,precise_address")
      .in("owner_request_id", ownerRequestIds),
    fetchMarketplaceOwnerRequestFlags(supabase, ownerRequestIds),
  ]);

  if (propertiesResult.error || contactsResult.error || requestsResult.error) {
    console.error(
      propertiesResult.error ?? contactsResult.error ?? requestsResult.error,
    );
    return [];
  }

  const propertiesById = new Map(
    (propertiesResult.data ?? []).map((item) => [item.id, item]),
  );
  const contactsByRequestId = new Map(
    (contactsResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const requestsById = new Map(
    (requestsResult.data ?? []).map((item) => [item.id, item]),
  );
  return leads
    .map((lead) => {
      const property = propertiesById.get(lead.property_id);

      if (!property) {
        return null;
      }

      return mapDbLeadToMarketplaceLead(
        lead,
        property,
        contactsByRequestId.get(lead.owner_request_id) ?? null,
        requestsById.get(lead.owner_request_id) ?? null,
        promotion,
      );
    })
    .filter((lead): lead is MarketplaceLead => Boolean(lead));
}

function mapDbLeadToMarketplaceLead(
  lead: LeadRow,
  property: Pick<
    PropertyRow,
    | "region"
    | "province"
    | "city"
    | "district"
    | "property_type"
    | "bedrooms"
    | "bathrooms"
    | "beds"
    | "approximate_area_sqm"
    | "timing"
    | "description"
    | "requested_services"
  >,
  contact: OwnerPublicContactRow | null,
  ownerRequest: OwnerRequestVerificationRow | null,
  promotion: MarketplacePromotion | null,
): MarketplaceLead {
  const now = new Date();
  const expiresAt =
    lead.visibility_mode === "prime_private"
      ? lead.prime_access_until ?? lead.created_at
      : lead.expires_at ?? lead.visible_until ?? lead.created_at;
  const isExpired = new Date(expiresAt).getTime() <= now.getTime();
  const internalStatus =
    isExpired && ["available", "one_slot_sold"].includes(lead.internal_status)
      ? "withdrawn_after_7_days"
      : lead.internal_status;
  const publicStatus =
    internalStatus === "withdrawn_after_7_days" ? "unavailable" : lead.public_status;
  const sharedPricing = resolvePromotionalPrice(
    promotion,
    "shared",
    lead.shared_price_cents,
  );
  const exclusivePricing = resolvePromotionalPrice(
    promotion,
    "exclusive",
    lead.exclusive_price_cents,
  );
  const appliedPromotionId =
    sharedPricing.promotionId ?? exclusivePricing.promotionId;

  return {
    id: lead.id,
    title: capitalizeLeadTitle(lead.title),
    ownerVerified: ownerRequest?.owner_verified ?? false,
    sublettingAvailable: ownerRequest?.subletting_available ?? false,
    region: property.region ?? "Italia",
    province: property.province ?? "Provincia non indicata",
    city: property.city ?? "Località non indicata",
    district:
      property.district ?? property.city ?? "Zona non indicata",
    address: formatAddressWithCity(
      contact?.precise_address ?? property.district ?? "",
      property.city,
    ) || "Indirizzo non disponibile",
    propertyType: property.property_type ?? "Tipologia non indicata",
    bedrooms: property.bedrooms ?? 0,
    bathrooms: property.bathrooms ?? 0,
    beds: property.beds ?? null,
    areaSqm: property.approximate_area_sqm ?? 0,
    timing: property.timing ?? "Da definire",
    services: property.requested_services ?? [],
    publicStatus,
    internalStatus,
    sharedSlotsSold: lead.shared_slots_sold,
    sharedPriceCents: sharedPricing.amountCents,
    exclusivePriceCents: exclusivePricing.amountCents,
    baseSharedPriceCents: lead.shared_price_cents,
    baseExclusivePriceCents: lead.exclusive_price_cents,
    promotionId: appliedPromotionId,
    promotionName:
      sharedPricing.promotionName ?? exclusivePricing.promotionName,
    exclusivePurchaseId: lead.exclusive_purchase_id,
    publishedAt: lead.published_at ?? lead.created_at,
    expiresAt,
    detailViewCount: Number(lead.detail_view_count ?? 0),
    ownerDescription:
      property.description ??
      "Il proprietario non ha aggiunto una descrizione facoltativa.",
  };
}

function isMissingDetailViewCountColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    Boolean(error.message?.includes("detail_view_count"))
  );
}

async function fetchMarketplaceOwnerRequestFlags(
  supabase: ServiceClient,
  ownerRequestIds: string[],
) {
  const result = await supabase
    .from("owner_requests")
    .select("id,owner_verified,subletting_available")
    .in("id", ownerRequestIds);

  if (!result.error || !isMissingSublettingColumnError(result.error)) {
    return result;
  }

  const fallback = await supabase
    .from("owner_requests")
    .select("id,owner_verified")
    .in("id", ownerRequestIds);

  return {
    ...fallback,
    data: (fallback.data ?? []).map((request) => ({
      ...request,
      subletting_available: false,
    } satisfies OwnerRequestVerificationRow)),
  };
}

function isMissingSublettingColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    Boolean(error.message?.includes("subletting_available"))
  );
}

function capitalizeLeadTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return title;
  }

  return `${normalizedTitle.charAt(0).toLocaleUpperCase("it-IT")}${normalizedTitle.slice(1)}`;
}

function formatAddressWithCity(address: string, city: string | null) {
  const cleanAddress = address.trim();
  const cleanCity = city?.trim();

  if (!cleanAddress) {
    return cleanCity ?? "";
  }

  if (!cleanCity) {
    return cleanAddress;
  }

  return cleanAddress.toLocaleLowerCase("it").endsWith(
    `, ${cleanCity.toLocaleLowerCase("it")}`,
  )
    ? cleanAddress
    : `${cleanAddress}, ${cleanCity}`;
}
