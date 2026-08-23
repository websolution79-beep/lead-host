import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminApiErrorResponse } from "@/lib/admin/auth";
import { requireMarketingAddonAccess } from "@/lib/addons/access";
import { writeAdminAuditLog } from "@/lib/admin/audit";

const propertySchema = z.object({
  name: z.string().trim().min(2).max(140),
  propertyType: z.string().trim().max(80).nullable(),
  propertyAddress: z.string().trim().max(300).nullable(),
  region: z.string().trim().max(100).nullable(),
  province: z.string().trim().max(100).nullable(),
  city: z.string().trim().max(120).nullable(),
  bedrooms: z.number().int().min(0).max(99).nullable(),
  bathrooms: z.number().int().min(0).max(99).nullable(),
  beds: z.number().int().min(0).max(99).nullable(),
  areaSqm: z.number().int().min(1).max(100000).nullable(),
  ownerFullName: z.string().trim().max(140).nullable(),
  ownerEmail: z.string().trim().email().max(255).nullable(),
  ownerPhone: z.string().trim().max(50).nullable(),
  ownerNotes: z.string().trim().max(5000).nullable(),
  operationalNotes: z.string().trim().max(5000).nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase, profile } = await requireMarketingAddonAccess(request);
    const search = request.nextUrl.searchParams.get("search")?.trim().toLowerCase() ?? "";
    const city = request.nextUrl.searchParams.get("city")?.trim() ?? "";
    const propertyType = request.nextUrl.searchParams.get("propertyType")?.trim() ?? "";
    const { data, error } = await supabase
      .from("marketing_managed_properties")
      .select("id,name,property_type,property_address,city,owner_full_name,owner_phone,cover_image_path,updated_at")
      .eq("profile_id", profile.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const filtered = (data ?? []).filter((property) => {
      const values = [property.name, property.property_type, property.property_address, property.city, property.owner_full_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (!search || values.includes(search)) && (!city || property.city === city) && (!propertyType || property.property_type === propertyType);
    });
    const properties = await Promise.all(filtered.map(async (property) => {
      const signed = property.cover_image_path
        ? await supabase.storage.from("marketing-managed-property-covers").createSignedUrl(property.cover_image_path, 300)
        : null;
      return { ...property, cover_image_url: signed?.data?.signedUrl ?? null };
    }));
    const cities = [...new Set((data ?? []).map((property) => property.city).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "it"));
    const propertyTypes = [...new Set((data ?? []).map((property) => property.property_type).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "it"));
    return NextResponse.json({ properties, cities, propertyTypes });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireMarketingAddonAccess(request);
    const input = propertySchema.parse(await request.json());
    const { data: property, error } = await supabase.from("marketing_managed_properties").insert({
      profile_id: profile.id,
      name: input.name,
      property_type: emptyToNull(input.propertyType),
      property_address: emptyToNull(input.propertyAddress),
      region: emptyToNull(input.region),
      province: emptyToNull(input.province),
      city: emptyToNull(input.city),
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      beds: input.beds,
      area_sqm: input.areaSqm,
      owner_full_name: emptyToNull(input.ownerFullName),
      owner_email: emptyToNull(input.ownerEmail),
      owner_phone: emptyToNull(input.ownerPhone),
      owner_notes: emptyToNull(input.ownerNotes),
      operational_notes: emptyToNull(input.operationalNotes),
    }).select("*").single();
    if (error) throw error;
    await writeAdminAuditLog({
      supabase, request, actorProfileId: profile.id, isSuperAdmin,
      actorRole: isSuperAdmin ? "super_admin" : "property_manager",
      entityType: "marketing_managed_property", entityId: property.id, action: "created",
      after: { name: property.name, city: property.city },
    });
    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function emptyToNull(value: string | null) { return value?.trim() || null; }
