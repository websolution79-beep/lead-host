import { NextResponse, type NextRequest } from "next/server";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PurchaseRow = {
  id: string;
  lead_id: string;
  mode: "shared" | "exclusive";
  amount_cents: number;
  status: string;
  unlocked_at: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, propertyManager } = await requirePropertyManager(request);
    const leadId = request.nextUrl.searchParams.get("leadId");

    if (leadId && !UUID_PATTERN.test(leadId)) {
      return NextResponse.json({ purchases: [] });
    }

    let purchaseQuery = supabase
      .from("lead_purchases")
      .select("id,lead_id,mode,amount_cents,status,unlocked_at,created_at")
      .eq("property_manager_id", propertyManager.id)
      .in("status", ["paid", "contact_unlocked"])
      .order("created_at", { ascending: false });

    if (leadId) {
      purchaseQuery = purchaseQuery.eq("lead_id", leadId);
    }

    const { data: purchases, error: purchasesError } = await purchaseQuery;

    if (purchasesError) throw purchasesError;

    const purchaseRows = (purchases ?? []) as PurchaseRow[];
    const leadIds = Array.from(new Set(purchaseRows.map((item) => item.lead_id)));

    if (leadIds.length === 0) {
      return NextResponse.json({ purchases: [] });
    }

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(
        "id,owner_request_id,property_id,title,internal_status,public_status,shared_slots_sold,exclusive_purchase_id,published_at,expires_at,visible_until,created_at",
      )
      .in("id", leadIds);

    if (leadsError) throw leadsError;

    const leadRows = leads ?? [];
    const propertyIds = Array.from(new Set(leadRows.map((item) => item.property_id)));
    const ownerRequestIds = Array.from(
      new Set(leadRows.map((item) => item.owner_request_id)),
    );

    const [propertiesResult, contactsResult] = await Promise.all([
      supabase
        .from("properties")
        .select(
          "id,region,province,city,district,property_type,bedrooms,bathrooms,beds,approximate_area_sqm,timing,description,requested_services",
        )
        .in("id", propertyIds),
      supabase
        .from("owner_contacts")
        .select("owner_request_id,first_name,last_name,email,phone,precise_address")
        .in("owner_request_id", ownerRequestIds),
    ]);

    if (propertiesResult.error || contactsResult.error) {
      throw propertiesResult.error ?? contactsResult.error;
    }

    const leadsById = new Map(leadRows.map((item) => [item.id, item]));
    const propertiesById = new Map(
      (propertiesResult.data ?? []).map((item) => [item.id, item]),
    );
    const contactsByOwnerRequestId = new Map(
      (contactsResult.data ?? []).map((item) => [item.owner_request_id, item]),
    );

    const mappedPurchases = purchaseRows
      .map((purchase) => {
        const lead = leadsById.get(purchase.lead_id);

        if (!lead) return null;

        const property = propertiesById.get(lead.property_id);
        const contact = contactsByOwnerRequestId.get(lead.owner_request_id);

        if (!property || !contact) return null;

        return {
          purchaseId: purchase.id,
          leadId: purchase.lead_id,
          purchaseMode: purchase.mode,
          amountCents: purchase.amount_cents,
          status: purchase.status,
          purchasedAt: purchase.created_at,
          unlockedAt: purchase.unlocked_at ?? purchase.created_at,
          lead: {
            id: lead.id,
            title: lead.title,
            region: property.region ?? "Italia",
            province: property.province ?? "",
            city: property.city ?? "",
            district: property.district ?? property.city ?? "",
            address: formatAddressWithCity(
              contact.precise_address ?? property.district ?? "",
              property.city,
            ),
            propertyType: property.property_type ?? "Immobile",
            bedrooms: property.bedrooms ?? 0,
            bathrooms: property.bathrooms ?? 0,
            beds: property.beds ?? property.bedrooms ?? 0,
            areaSqm: property.approximate_area_sqm ?? 0,
            timing: property.timing ?? "Da definire",
            services: property.requested_services ?? [],
            ownerDescription:
              property.description ??
              "Il proprietario non ha aggiunto una descrizione facoltativa.",
          },
          ownerContact: {
            firstName: contact.first_name ?? "",
            lastName: contact.last_name ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
          },
        };
      })
      .filter(Boolean);

    return NextResponse.json({ purchases: mappedPurchases });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
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
