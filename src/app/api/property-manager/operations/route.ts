import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { ITALY_GEO } from "@/lib/geo/italy-geo";
import {
  PM_SERVICE_OPTIONS,
  fetchPropertyManagerOperations,
  savePropertyManagerOperations,
  type PmServiceCode,
} from "@/lib/property-manager/operations";

const serviceCodes = PM_SERVICE_OPTIONS.map((service) => service.code) as [
  PmServiceCode,
  ...PmServiceCode[],
];

const areaSchema = z.object({
  scope: z.enum(["region", "province", "city"]),
  region: z.string().min(1),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});

const operationsSchema = z.object({
  services: z.array(z.enum(serviceCodes)).min(1).max(PM_SERVICE_OPTIONS.length),
  areas: z.array(areaSchema).min(1).max(20),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase, propertyManager } = await requirePropertyManager(request);
    const operations = await fetchPropertyManagerOperations({
      supabase,
      propertyManagerId: propertyManager.id,
    });

    return NextResponse.json({
      serviceOptions: PM_SERVICE_OPTIONS,
      operations,
    });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, propertyManager } = await requirePropertyManager(request);
    const payload = operationsSchema.safeParse(await request.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: "Seleziona almeno un servizio e una zona operativa." },
        { status: 400 },
      );
    }

    for (const area of payload.data.areas) {
      if (!isValidArea(area)) {
        return NextResponse.json(
          { error: "Una delle aree operative non è valida." },
          { status: 400 },
        );
      }
    }

    const operations = await savePropertyManagerOperations({
      supabase,
      propertyManagerId: propertyManager.id,
      serviceCodes: Array.from(new Set(payload.data.services)),
      areas: dedupeAreas(payload.data.areas),
    });

    return NextResponse.json({ ok: true, operations });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}

function isValidArea(area: z.infer<typeof areaSchema>) {
  const region = ITALY_GEO.find((item) => item.region === area.region);

  if (!region) return false;
  if (area.scope === "region") return true;

  const province = region.provinces.find((item) => item.province === area.province);

  if (!province) return false;
  if (area.scope === "province") return true;

  return Boolean(area.city && (province.cities as string[]).includes(area.city));
}

function dedupeAreas(areas: z.infer<typeof areaSchema>[]) {
  const seen = new Set<string>();

  return areas.filter((area) => {
    const key = [area.scope, area.region, area.province ?? "", area.city ?? ""].join("|");

    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}
