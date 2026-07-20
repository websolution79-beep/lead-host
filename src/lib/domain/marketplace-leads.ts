import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { MarketplaceLead } from "@/lib/domain/sample-data";
import type { Database } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type OwnerContactRow = Database["public"]["Tables"]["owner_contacts"]["Row"];

export async function getPublishedMarketplaceLeads() {
  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,created_at,updated_at",
    )
    .not("published_at", "is", null)
    .or(`visible_until.is.null,visible_until.gte.${now}`)
    .order("published_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return mapLeadRowsToMarketplace(supabase, leads ?? []);
}

export async function getPublishedMarketplaceLeadById(id: string) {
  const supabase = createServiceSupabaseClient();

  const { data: lead, error } = await supabase
    .from("leads")
    .select(
      "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,created_at,updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !lead || !lead.published_at) {
    return null;
  }

  const [mappedLead] = await mapLeadRowsToMarketplace(supabase, [lead]);

  return mappedLead ?? null;
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
  contact: Pick<OwnerContactRow, "precise_address"> | null,
): MarketplaceLead {
  return {
    id: lead.id,
    title: lead.title,
    region: property.region ?? "Italia",
    province: property.province ?? "",
    city: property.city ?? "",
    district: property.district ?? property.city ?? "",
    address: contact?.precise_address ?? property.district ?? property.city ?? "",
    propertyType: property.property_type ?? "Immobile",
    bedrooms: property.bedrooms ?? 0,
    bathrooms: property.bathrooms ?? 0,
    beds: property.beds ?? property.bedrooms ?? 0,
    areaSqm: property.approximate_area_sqm ?? 0,
    timing: property.timing ?? "Da definire",
    services: property.requested_services ?? [],
    publicStatus: lead.public_status,
    internalStatus: lead.internal_status,
    sharedSlotsSold: lead.shared_slots_sold,
    exclusivePurchaseId: lead.exclusive_purchase_id,
    publishedAt: lead.published_at ?? lead.created_at,
    expiresAt: lead.expires_at ?? lead.visible_until ?? lead.created_at,
    ownerDescription:
      property.description ??
      "Il proprietario non ha aggiunto una descrizione facoltativa.",
  };
}
