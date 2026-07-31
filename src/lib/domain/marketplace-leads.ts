import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { MarketplaceLead } from "@/lib/domain/sample-data";
import type { Database } from "@/lib/supabase/database.types";
import { unstable_cache } from "next/cache";
import { MARKETPLACE_LEADS_CACHE_TAG } from "@/lib/cache/tags";

type ServiceClient = SupabaseClient<Database>;

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type OwnerPublicContactRow = Pick<
  Database["public"]["Tables"]["owner_contacts"]["Row"],
  "precise_address"
>;
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

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,sold_at,sold_visible_until,created_at,updated_at",
    )
    .not("published_at", "is", null)
    .or(buildMarketplaceVisibilityFilter(now))
    .order("published_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return mapLeadRowsToMarketplace(supabase, leads ?? []);
}

export async function getPublishedMarketplaceLeadById(id: string) {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,sold_at,sold_visible_until,created_at,updated_at",
    )
    .eq("id", id)
    .or(buildMarketplaceVisibilityFilter(now))
    .maybeSingle();

  if (
    error ||
    !lead ||
    !lead.published_at ||
    (lead.visible_until && lead.visible_until < now)
  ) {
    return null;
  }

  const [mappedLead] = await mapLeadRowsToMarketplace(supabase, [lead]);

  return mappedLead ?? null;
}

function buildMarketplaceVisibilityFilter(now: string) {
  return [
    `and(internal_status.in.(available,one_slot_sold),expires_at.gt.${now})`,
    `and(internal_status.eq.withdrawn_after_7_days,visible_until.gte.${now})`,
    `and(internal_status.in.(sold_two_pm,sold_exclusive),sold_visible_until.gte.${now})`,
  ].join(",");
}

async function mapLeadRowsToMarketplace(supabase: ServiceClient, leads: LeadRow[]) {
  const propertyIds = Array.from(new Set(leads.map((lead) => lead.property_id)));
  const ownerRequestIds = Array.from(new Set(leads.map((lead) => lead.owner_request_id)));

  if (propertyIds.length === 0) {
    return [];
  }

  const [propertiesResult, contactsResult] = await Promise.all([
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
  ]);

  if (propertiesResult.error || contactsResult.error) {
    console.error(propertiesResult.error ?? contactsResult.error);
    return [];
  }

  const propertiesById = new Map(
    (propertiesResult.data ?? []).map((item) => [item.id, item]),
  );
  const contactsByRequestId = new Map(
    (contactsResult.data ?? []).map((item) => [item.owner_request_id, item]),
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
): MarketplaceLead {
  const now = new Date();
  const expiresAt = lead.expires_at ?? lead.visible_until ?? lead.created_at;
  const isExpired = new Date(expiresAt).getTime() <= now.getTime();
  const internalStatus =
    isExpired && ["available", "one_slot_sold"].includes(lead.internal_status)
      ? "withdrawn_after_7_days"
      : lead.internal_status;
  const publicStatus =
    internalStatus === "withdrawn_after_7_days" ? "unavailable" : lead.public_status;

  return {
    id: lead.id,
    title: capitalizeLeadTitle(lead.title),
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
    beds: property.beds ?? property.bedrooms ?? 0,
    areaSqm: property.approximate_area_sqm ?? 0,
    timing: property.timing ?? "Da definire",
    services: property.requested_services ?? [],
    publicStatus,
    internalStatus,
    sharedSlotsSold: lead.shared_slots_sold,
    sharedPriceCents: lead.shared_price_cents,
    exclusivePriceCents: lead.exclusive_price_cents,
    exclusivePurchaseId: lead.exclusive_purchase_id,
    publishedAt: lead.published_at ?? lead.created_at,
    expiresAt,
    ownerDescription:
      property.description ??
      "Il proprietario non ha aggiunto una descrizione facoltativa.",
  };
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
