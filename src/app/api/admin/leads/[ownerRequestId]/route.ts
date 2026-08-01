import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import { getMissingLeadFields } from "@/lib/owner-requests/completeness";
import {
  checkOwnerRequestDuplicates,
  duplicateCheckToJson,
} from "@/lib/owner-requests/duplicate-check";
import type { Json } from "@/lib/supabase/database.types";

type RouteContext = {
  params: Promise<{
    ownerRequestId: string;
  }>;
};

const nullableText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .transform((value) => value?.trim() || null)
    .optional();

const nullableEmail = z
  .union([z.string().email().max(160), z.literal(""), z.null()])
  .transform((value) => value?.trim().toLowerCase() || null)
  .optional();

const nullableInteger = (min: number, max: number) =>
  z
    .union([z.number().int().min(min).max(max), z.null()])
    .optional();

const updateSchema = z.object({
  contact: z
    .object({
      firstName: nullableText(80),
      lastName: nullableText(80),
      email: nullableEmail,
      phone: nullableText(30),
      preciseAddress: nullableText(180),
    })
    .optional(),
  property: z
    .object({
      region: nullableText(100),
      province: nullableText(100),
      city: nullableText(160),
      propertyType: nullableText(100),
      bedrooms: nullableInteger(0, 50),
      bathrooms: nullableInteger(0, 50),
      beds: nullableInteger(0, 100),
      areaSqm: nullableInteger(1, 5000),
      currentStatus: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
      requestedServices: z
        .array(z.string().trim().min(1).max(160))
        .max(20)
        .optional(),
      timing: nullableText(120),
      description: nullableText(700),
    })
    .optional(),
  consents: z
    .object({
      privacy: z.boolean().optional(),
      dataSharing: z.boolean().optional(),
      marketing: z.boolean().optional(),
    })
    .optional(),
  qualificationNotes: nullableText(1200),
});

const editableStatuses = new Set([
  "new_from_meta",
  "waiting_for_completion",
  "completed",
  "pending",
  "to_verify",
  "approved",
  "published",
]);

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { ownerRequestId } = await context.params;
    const payload = updateSchema.safeParse(await request.json().catch(() => null));

    if (!payload.success) {
      return NextResponse.json(
        {
          error: "Dati lead non validi.",
          fields: payload.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 422 },
      );
    }

    const { supabase, profile, isSuperAdmin } =
      await requireSuperAdmin(request);
    const [requestResult, contactResult, propertyResult] = await Promise.all([
      supabase
        .from("owner_requests")
        .select(
          "id,status,privacy_consent_at,data_sharing_consent_at,marketing_consent_at,normalized_payload,qualification_notes",
        )
        .eq("id", ownerRequestId)
        .maybeSingle(),
      supabase
        .from("owner_contacts")
        .select("id,first_name,last_name,email,phone,precise_address")
        .eq("owner_request_id", ownerRequestId)
        .maybeSingle(),
      supabase
        .from("properties")
        .select(
          "id,region,province,city,property_type,bedrooms,bathrooms,beds,approximate_area_sqm,current_status,requested_services,timing,description",
        )
        .eq("owner_request_id", ownerRequestId)
        .maybeSingle(),
    ]);

    if (requestResult.error) throw requestResult.error;
    if (contactResult.error) throw contactResult.error;
    if (propertyResult.error) throw propertyResult.error;
    if (!requestResult.data) {
      return NextResponse.json({ error: "Richiesta non trovata." }, { status: 404 });
    }

    if (!editableStatuses.has(requestResult.data.status)) {
      return NextResponse.json(
        { error: "Questo lead non può essere modificato nello stato attuale." },
        { status: 409 },
      );
    }

    const nextContact = {
      firstName:
        payload.data.contact?.firstName !== undefined
          ? payload.data.contact.firstName
          : contactResult.data?.first_name ?? null,
      lastName:
        payload.data.contact?.lastName !== undefined
          ? payload.data.contact.lastName
          : contactResult.data?.last_name ?? null,
      email:
        payload.data.contact?.email !== undefined
          ? payload.data.contact.email
          : contactResult.data?.email ?? null,
      phone:
        payload.data.contact?.phone !== undefined
          ? payload.data.contact.phone
          : contactResult.data?.phone ?? null,
      preciseAddress:
        payload.data.contact?.preciseAddress !== undefined
          ? payload.data.contact.preciseAddress
          : contactResult.data?.precise_address ?? null,
    };
    const nextProperty = {
      region:
        payload.data.property?.region !== undefined
          ? payload.data.property.region
          : propertyResult.data?.region ?? null,
      province:
        payload.data.property?.province !== undefined
          ? payload.data.property.province
          : propertyResult.data?.province ?? null,
      city:
        payload.data.property?.city !== undefined
          ? payload.data.property.city
          : propertyResult.data?.city ?? null,
      propertyType:
        payload.data.property?.propertyType !== undefined
          ? payload.data.property.propertyType
          : propertyResult.data?.property_type ?? null,
      bedrooms:
        payload.data.property?.bedrooms !== undefined
          ? payload.data.property.bedrooms
          : propertyResult.data?.bedrooms ?? null,
      bathrooms:
        payload.data.property?.bathrooms !== undefined
          ? payload.data.property.bathrooms
          : propertyResult.data?.bathrooms ?? null,
      beds:
        payload.data.property?.beds !== undefined
          ? payload.data.property.beds
          : propertyResult.data?.beds ?? null,
      areaSqm:
        payload.data.property?.areaSqm !== undefined
          ? payload.data.property.areaSqm
          : propertyResult.data?.approximate_area_sqm ?? null,
      currentStatus:
        payload.data.property?.currentStatus ??
        propertyResult.data?.current_status ??
        [],
      requestedServices:
        payload.data.property?.requestedServices ??
        propertyResult.data?.requested_services ??
        [],
      timing:
        payload.data.property?.timing !== undefined
          ? payload.data.property.timing
          : propertyResult.data?.timing ?? null,
      description:
        payload.data.property?.description !== undefined
          ? payload.data.property.description
          : propertyResult.data?.description ?? null,
    };
    const now = new Date().toISOString();
    const nextConsents = {
      privacy:
        payload.data.consents?.privacy ??
        Boolean(requestResult.data.privacy_consent_at),
      dataSharing:
        payload.data.consents?.dataSharing ??
        Boolean(requestResult.data.data_sharing_consent_at),
      marketing:
        payload.data.consents?.marketing ??
        Boolean(requestResult.data.marketing_consent_at),
    };
    const duplicateCheck = await checkOwnerRequestDuplicates({
      supabase,
      currentOwnerRequestId: ownerRequestId,
      input: {
        contact: nextContact,
        property: nextProperty,
      },
    });
    const missingFields = getMissingLeadFields({
      contact: nextContact,
      property: nextProperty,
      consents: nextConsents,
    });

    const contactWrite = contactResult.data
      ? supabase
          .from("owner_contacts")
          .update({
            first_name: nextContact.firstName,
            last_name: nextContact.lastName,
            email: nextContact.email,
            phone: nextContact.phone,
            precise_address: nextContact.preciseAddress,
          })
          .eq("id", contactResult.data.id)
      : supabase.from("owner_contacts").insert({
          owner_request_id: ownerRequestId,
          first_name: nextContact.firstName,
          last_name: nextContact.lastName,
          email: nextContact.email,
          phone: nextContact.phone,
          precise_address: nextContact.preciseAddress,
        });
    const propertyWrite = propertyResult.data
      ? supabase
          .from("properties")
          .update({
            region: nextProperty.region,
            province: nextProperty.province,
            city: nextProperty.city,
            property_type: nextProperty.propertyType,
            bedrooms: nextProperty.bedrooms,
            bathrooms: nextProperty.bathrooms,
            beds: nextProperty.beds,
            approximate_area_sqm: nextProperty.areaSqm,
            current_status: nextProperty.currentStatus.length
              ? nextProperty.currentStatus
              : null,
            requested_services: nextProperty.requestedServices,
            timing: nextProperty.timing,
            description: nextProperty.description,
          })
          .eq("id", propertyResult.data.id)
      : supabase.from("properties").insert({
          owner_request_id: ownerRequestId,
          region: nextProperty.region,
          province: nextProperty.province,
          city: nextProperty.city,
          property_type: nextProperty.propertyType,
          bedrooms: nextProperty.bedrooms,
          bathrooms: nextProperty.bathrooms,
          beds: nextProperty.beds,
          approximate_area_sqm: nextProperty.areaSqm,
          current_status: nextProperty.currentStatus.length
            ? nextProperty.currentStatus
            : null,
          requested_services: nextProperty.requestedServices,
          timing: nextProperty.timing,
          description: nextProperty.description,
        });
    const requestWrite = supabase
      .from("owner_requests")
      .update({
        privacy_consent_at: nextConsents.privacy
          ? requestResult.data.privacy_consent_at ?? now
          : null,
        data_sharing_consent_at: nextConsents.dataSharing
          ? requestResult.data.data_sharing_consent_at ?? now
          : null,
        marketing_consent_at: nextConsents.marketing
          ? requestResult.data.marketing_consent_at ?? now
          : null,
        qualification_notes:
          payload.data.qualificationNotes !== undefined
            ? payload.data.qualificationNotes
            : requestResult.data.qualification_notes,
        normalized_payload: mergeNormalizedPayload(
          requestResult.data.normalized_payload,
          nextContact,
          nextProperty,
        ),
        duplicate_check: duplicateCheckToJson(duplicateCheck),
      })
      .eq("id", ownerRequestId);

    const [contactWriteResult, propertyWriteResult, requestWriteResult] =
      await Promise.all([contactWrite, propertyWrite, requestWrite]);

    const writeError =
      contactWriteResult.error ||
      propertyWriteResult.error ||
      requestWriteResult.error;

    if (writeError) throw writeError;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "owner_request",
      entityId: ownerRequestId,
      action: "lead.information_updated",
      before: { status: requestResult.data.status },
      after: {
        status: requestResult.data.status,
        missing_fields: missingFields.map((field) => field.key),
      },
    });

    return NextResponse.json({
      ok: true,
      missingFields,
      duplicateCheck,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function mergeNormalizedPayload(
  current: Json,
  contact: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    preciseAddress: string | null;
  },
  property: {
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
  },
): Json {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? current
      : {};

  return JSON.parse(
    JSON.stringify({
      ...base,
      contact: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        precise_address: contact.preciseAddress,
      },
      property: {
        region: property.region,
        province: property.province,
        city: property.city,
        property_type: property.propertyType,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        beds: property.beds,
        approximate_area_sqm: property.areaSqm,
        current_status: property.currentStatus,
        requested_services: property.requestedServices,
        timing: property.timing,
        description: property.description,
      },
    }),
  ) as Json;
}
