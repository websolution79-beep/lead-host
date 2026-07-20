import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSharedSlotsAvailable } from "@/lib/domain/lead-state";

type ServiceClient = SupabaseClient<Database>;

export type AdminLeadPurchase = {
  id: string;
  mode: "shared" | "exclusive";
  status: string;
  amountCents: number;
  createdAt: string;
  buyerCompany: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
};

export type AdminLeadRecord = {
  ownerRequestId: string;
  createdAt: string;
  updatedAt: string;
  requestStatus: string;
  acquisitionChannel: string;
  qualificationNotes: string | null;
  contact: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    preciseAddress: string | null;
  } | null;
  property: {
    id: string;
    region: string | null;
    province: string | null;
    city: string | null;
    propertyType: string | null;
    bedrooms: number | null;
    bathrooms: number | null;
    beds: number | null;
    areaSqm: number | null;
    currentStatus: string[];
    requestedServices: string[];
    timing: string | null;
    description: string | null;
  } | null;
  lead: {
    id: string;
    title: string;
    internalStatus: string;
    publicStatus: string;
    sharedSlotsSold: number;
    sharedSlotsAvailable: number;
    sharedPriceCents: number;
    exclusivePriceCents: number;
    exclusivePurchaseId: string | null;
    publishedAt: string | null;
    expiresAt: string | null;
    visibleUntil: string | null;
  } | null;
  purchases: AdminLeadPurchase[];
};

export async function fetchAdminLeadRecords(supabase: ServiceClient) {
  const { data: requests, error: requestsError } = await supabase
    .from("owner_requests")
    .select(
      "id,created_at,updated_at,status,acquisition_channel,qualification_notes",
    )
    .order("created_at", { ascending: false })
    .limit(150);

  if (requestsError) {
    throw requestsError;
  }

  const ownerRequestIds = (requests ?? []).map((item) => item.id);

  if (ownerRequestIds.length === 0) {
    return [];
  }

  const [contactsResult, propertiesResult, leadsResult] = await Promise.all([
    supabase
      .from("owner_contacts")
      .select("owner_request_id,first_name,last_name,email,phone,precise_address")
      .in("owner_request_id", ownerRequestIds),
    supabase
      .from("properties")
      .select(
        "id,owner_request_id,region,province,city,property_type,bedrooms,bathrooms,beds,approximate_area_sqm,current_status,requested_services,timing,description",
      )
      .in("owner_request_id", ownerRequestIds),
    supabase
      .from("leads")
      .select(
        "id,owner_request_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until",
      )
      .in("owner_request_id", ownerRequestIds),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (propertiesResult.error) throw propertiesResult.error;
  if (leadsResult.error) throw leadsResult.error;

  const contactsByRequest = new Map(
    (contactsResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const propertiesByRequest = new Map(
    (propertiesResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const leadsByRequest = new Map(
    (leadsResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const leadIds = (leadsResult.data ?? []).map((item) => item.id);
  const purchasesByLead = await fetchPurchasesByLead(supabase, leadIds);

  return (requests ?? []).map((request) => {
    const contact = contactsByRequest.get(request.id) ?? null;
    const property = propertiesByRequest.get(request.id) ?? null;
    const lead = leadsByRequest.get(request.id) ?? null;

    return {
      ownerRequestId: request.id,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      requestStatus: request.status,
      acquisitionChannel: request.acquisition_channel,
      qualificationNotes: request.qualification_notes,
      contact: contact
        ? {
            firstName: contact.first_name,
            lastName: contact.last_name,
            email: contact.email,
            phone: contact.phone,
            preciseAddress: contact.precise_address,
          }
        : null,
      property: property
        ? {
            id: property.id,
            region: property.region,
            province: property.province,
            city: property.city,
            propertyType: property.property_type,
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            beds: property.beds,
            areaSqm: property.approximate_area_sqm,
            currentStatus: property.current_status ?? [],
            requestedServices: property.requested_services ?? [],
            timing: property.timing,
            description: property.description,
          }
        : null,
      lead: lead
        ? {
            id: lead.id,
            title: lead.title,
            internalStatus: lead.internal_status,
            publicStatus: lead.public_status,
            sharedSlotsSold: lead.shared_slots_sold,
            sharedSlotsAvailable: getSharedSlotsAvailable(lead.shared_slots_sold),
            sharedPriceCents: lead.shared_price_cents,
            exclusivePriceCents: lead.exclusive_price_cents,
            exclusivePurchaseId: lead.exclusive_purchase_id,
            publishedAt: lead.published_at,
            expiresAt: lead.expires_at,
            visibleUntil: lead.visible_until,
          }
        : null,
      purchases: lead ? purchasesByLead.get(lead.id) ?? [] : [],
    } satisfies AdminLeadRecord;
  });
}

async function fetchPurchasesByLead(supabase: ServiceClient, leadIds: string[]) {
  const purchasesByLead = new Map<string, AdminLeadPurchase[]>();

  if (leadIds.length === 0) {
    return purchasesByLead;
  }

  const { data: purchases, error: purchasesError } = await supabase
    .from("lead_purchases")
    .select("id,lead_id,property_manager_id,mode,status,amount_cents,created_at")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  if (purchasesError) {
    throw purchasesError;
  }

  const propertyManagerIds = Array.from(
    new Set((purchases ?? []).map((item) => item.property_manager_id)),
  );

  const { data: managers, error: managersError } = propertyManagerIds.length
    ? await supabase
        .from("property_manager_profiles")
        .select("id,profile_id,company_name")
        .in("id", propertyManagerIds)
    : { data: [], error: null };

  if (managersError) {
    throw managersError;
  }

  const profileIds = Array.from(new Set((managers ?? []).map((item) => item.profile_id)));
  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id,email,first_name,last_name")
        .in("id", profileIds)
    : { data: [], error: null };

  if (profilesError) {
    throw profilesError;
  }

  const managersById = new Map((managers ?? []).map((item) => [item.id, item]));
  const profilesById = new Map((profiles ?? []).map((item) => [item.id, item]));

  for (const purchase of purchases ?? []) {
    const manager = managersById.get(purchase.property_manager_id);
    const profile = manager ? profilesById.get(manager.profile_id) : null;
    const buyerName = profile
      ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || null
      : null;
    const record: AdminLeadPurchase = {
      id: purchase.id,
      mode: purchase.mode,
      status: purchase.status,
      amountCents: purchase.amount_cents,
      createdAt: purchase.created_at,
      buyerCompany: manager?.company_name ?? null,
      buyerName,
      buyerEmail: profile?.email ?? null,
    };
    const current = purchasesByLead.get(purchase.lead_id) ?? [];
    current.push(record);
    purchasesByLead.set(purchase.lead_id, current);
  }

  return purchasesByLead;
}
