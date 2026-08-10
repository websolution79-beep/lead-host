import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  getVisibleSharedSlotsAvailable,
  parseLeadDate,
} from "@/lib/domain/lead-state";
import {
  fetchCommercialSettings,
  resolveLeadPricing,
  type LeadPricingSuggestion,
} from "@/lib/config/commercial-settings";

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
  statusReason: string | null;
  statusChangedAt: string | null;
  reviewPipelineStageId: string | null;
  firstWorkedBy: {
    profileId: string;
    firstName: string | null;
    lastName: string | null;
    badgeColor: string | null;
  } | null;
  firstWorkedAt: string | null;
  ownerVerified: boolean;
  sublettingAvailable: boolean;
  sublettingFeatureAvailable: boolean;
  consents: {
    privacy: boolean;
    dataSharing: boolean;
    marketing: boolean;
  };
  duplicateCheck: {
    status: "clear" | "possible_duplicate" | "duplicate" | "unchecked" | string;
    checkedAt: string | null;
    matchCount: number;
    highestScore: number;
    matches: Array<{
      ownerRequestId: string;
      score: number;
      status: string;
      createdAt: string;
      reasons: string[];
    }>;
  };
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
    soldAt: string | null;
    soldVisibleUntil: string | null;
  } | null;
  pricing: LeadPricingSuggestion;
  pricingByType: {
    inTarget: LeadPricingSuggestion;
    verified: LeadPricingSuggestion;
  };
  purchases: AdminLeadPurchase[];
};

export async function fetchAdminLeadRecords(supabase: ServiceClient) {
  const { settings } = await fetchCommercialSettings(supabase);
  const ownerRequestsResult = await fetchAdminOwnerRequests(supabase);
  const { data: requests, error: requestsError } = ownerRequestsResult;

  if (requestsError) {
    throw requestsError;
  }

  const ownerRequestIds = (requests ?? []).map((item) => item.id);

  if (ownerRequestIds.length === 0) {
    return [];
  }

  const firstWorkedProfileIds = [...new Set((requests ?? []).map((item) => item.first_worked_by_profile_id).filter((id): id is string => Boolean(id)))];
  const [contactsResult, propertiesResult, leadsResult, statusMetadataResult, firstWorkedProfilesResult, firstWorkedMembersResult] =
    await Promise.all([
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
          "id,owner_request_id,title,internal_status,public_status,shared_slots_sold,shared_price_cents,exclusive_price_cents,exclusive_purchase_id,published_at,expires_at,visible_until,sold_at,sold_visible_until",
        )
        .in("owner_request_id", ownerRequestIds),
      supabase
        .from("owner_requests")
        .select("id,status_reason,status_changed_at")
        .in("id", ownerRequestIds),
      firstWorkedProfileIds.length
        ? supabase.from("profiles").select("id,first_name,last_name").in("id", firstWorkedProfileIds)
        : Promise.resolve({ data: [], error: null }),
      firstWorkedProfileIds.length
        ? supabase.from("team_members").select("profile_id,badge_color").in("profile_id", firstWorkedProfileIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (contactsResult.error) throw contactsResult.error;
  if (propertiesResult.error) throw propertiesResult.error;
  if (leadsResult.error) throw leadsResult.error;
  if (firstWorkedProfilesResult.error) throw firstWorkedProfilesResult.error;
  if (firstWorkedMembersResult.error) throw firstWorkedMembersResult.error;
  if (
    statusMetadataResult.error &&
    !statusMetadataResult.error.message.includes("status_reason")
  ) {
    throw statusMetadataResult.error;
  }

  const contactsByRequest = new Map(
    (contactsResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const propertiesByRequest = new Map(
    (propertiesResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const leadsByRequest = new Map(
    (leadsResult.data ?? []).map((item) => [item.owner_request_id, item]),
  );
  const statusMetadataByRequest = new Map(
    (statusMetadataResult.data ?? []).map((item) => [item.id, item]),
  );
  const firstWorkedProfilesById = new Map(
    (firstWorkedProfilesResult.data ?? []).map((profile) => [profile.id, profile]),
  );
  const firstWorkedMembersByProfileId = new Map(
    (firstWorkedMembersResult.data ?? []).map((member) => [member.profile_id, member]),
  );
  const leadIds = (leadsResult.data ?? []).map((item) => item.id);
  const purchasesByLead = await fetchPurchasesByLead(supabase, leadIds);

  return (requests ?? []).map((request) => {
    const contact = contactsByRequest.get(request.id) ?? null;
    const property = propertiesByRequest.get(request.id) ?? null;
    const lead = leadsByRequest.get(request.id) ?? null;
    const statusMetadata = statusMetadataByRequest.get(request.id) ?? null;
    const firstWorkedProfile = request.first_worked_by_profile_id
      ? firstWorkedProfilesById.get(request.first_worked_by_profile_id) ?? null
      : null;
    const firstWorkedMember = request.first_worked_by_profile_id
      ? firstWorkedMembersByProfileId.get(request.first_worked_by_profile_id) ?? null
      : null;
    const location = {
      region: property?.region,
      province: property?.province,
      city: property?.city,
    };
    const inTargetPricing = resolveLeadPricing(settings, location, false);
    const verifiedPricing = resolveLeadPricing(settings, location, true);
    const suggestedPricing = request.owner_verified
      ? verifiedPricing
      : inTargetPricing;
    const pricing = lead
      ? {
          sharedPriceCents: lead.shared_price_cents,
          exclusivePriceCents: lead.exclusive_price_cents,
          source: "published" as const,
          label: "Prezzo pubblicato",
          ruleId: null,
        }
      : suggestedPricing;

    return {
      ownerRequestId: request.id,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      requestStatus: request.status,
      acquisitionChannel: request.acquisition_channel,
      qualificationNotes: request.qualification_notes,
      statusReason: statusMetadata?.status_reason ?? null,
      statusChangedAt: statusMetadata?.status_changed_at ?? null,
      reviewPipelineStageId: request.review_pipeline_stage_id,
      firstWorkedBy: firstWorkedProfile && request.first_worked_by_profile_id
        ? {
            profileId: request.first_worked_by_profile_id,
            firstName: firstWorkedProfile.first_name,
            lastName: firstWorkedProfile.last_name,
            badgeColor: firstWorkedMember?.badge_color ?? null,
          }
        : null,
      firstWorkedAt: request.first_worked_at,
      ownerVerified: request.owner_verified,
      sublettingAvailable: request.subletting_available,
      sublettingFeatureAvailable:
        ownerRequestsResult.sublettingColumnAvailable,
      consents: {
        privacy: Boolean(request.privacy_consent_at),
        dataSharing: Boolean(request.data_sharing_consent_at),
        marketing: Boolean(request.marketing_consent_at),
      },
      duplicateCheck: parseDuplicateCheck(request.duplicate_check),
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
            sharedSlotsAvailable: getVisibleSharedSlotsAvailable({
              internalStatus: lead.internal_status,
              sharedSlotsSold: lead.shared_slots_sold,
              exclusivePurchaseId: lead.exclusive_purchase_id,
              expiresAt: parseLeadDate(
                lead.expires_at ?? lead.visible_until ?? new Date(0).toISOString(),
              ),
            }),
            sharedPriceCents: lead.shared_price_cents,
            exclusivePriceCents: lead.exclusive_price_cents,
            exclusivePurchaseId: lead.exclusive_purchase_id,
            publishedAt: lead.published_at,
            expiresAt: lead.expires_at,
            visibleUntil: lead.visible_until,
            soldAt: lead.sold_at,
            soldVisibleUntil: lead.sold_visible_until,
          }
        : null,
      pricing,
      pricingByType: {
        inTarget: inTargetPricing,
        verified: verifiedPricing,
      },
      purchases: lead ? purchasesByLead.get(lead.id) ?? [] : [],
    } satisfies AdminLeadRecord;
  });
}

async function fetchAdminOwnerRequests(supabase: ServiceClient) {
  const fields =
    "id,created_at,updated_at,status,acquisition_channel,qualification_notes,duplicate_check,privacy_consent_at,data_sharing_consent_at,marketing_consent_at,owner_verified,subletting_available,review_pipeline_stage_id,first_worked_by_profile_id,first_worked_at";
  const result = await supabase
    .from("owner_requests")
    .select(fields)
    .order("created_at", { ascending: false })
    .limit(150);

  if (!result.error || !isMissingSublettingColumnError(result.error)) {
    return { ...result, sublettingColumnAvailable: true };
  }

  const fallback = await supabase
    .from("owner_requests")
    .select(
      "id,created_at,updated_at,status,acquisition_channel,qualification_notes,duplicate_check,privacy_consent_at,data_sharing_consent_at,marketing_consent_at,owner_verified,review_pipeline_stage_id,first_worked_by_profile_id,first_worked_at",
    )
    .order("created_at", { ascending: false })
    .limit(150);

  return {
    ...fallback,
    data: (fallback.data ?? []).map((request) => ({
      ...request,
      subletting_available: false,
    })),
    sublettingColumnAvailable: false,
  };
}

function isMissingSublettingColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    Boolean(error.message?.includes("subletting_available"))
  );
}

function parseDuplicateCheck(value: Json): AdminLeadRecord["duplicateCheck"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyDuplicateCheck("unchecked");
  }

  const record = value as Record<string, unknown>;
  const matches = Array.isArray(record.matches)
    ? record.matches
        .map((match) => parseDuplicateMatch(match))
        .filter((match): match is AdminLeadRecord["duplicateCheck"]["matches"][number] =>
          Boolean(match),
        )
    : [];

  return {
    status: typeof record.status === "string" ? record.status : "unchecked",
    checkedAt: typeof record.checked_at === "string" ? record.checked_at : null,
    matchCount:
      typeof record.match_count === "number" ? record.match_count : matches.length,
    highestScore:
      typeof record.highest_score === "number"
        ? record.highest_score
        : matches[0]?.score ?? 0,
    matches,
  };
}

function parseDuplicateMatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const ownerRequestId = record.owner_request_id;

  if (typeof ownerRequestId !== "string") return null;

  return {
    ownerRequestId,
    score: typeof record.score === "number" ? record.score : 0,
    status: typeof record.status === "string" ? record.status : "unknown",
    createdAt: typeof record.created_at === "string" ? record.created_at : "",
    reasons: Array.isArray(record.reasons)
      ? record.reasons.filter((reason): reason is string => typeof reason === "string")
      : [],
  };
}

function emptyDuplicateCheck(status: AdminLeadRecord["duplicateCheck"]["status"]) {
  return {
    status,
    checkedAt: null,
    matchCount: 0,
    highestScore: 0,
    matches: [],
  };
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
