import { z } from "zod";

const optInSchema = z.object({
  contact: z.object({
    id: z.union([z.number().int().positive().safe(), z.string().regex(/^\d{1,160}$/)]),
    email: z.string().trim().email().max(255),
    sourceURL: z.string().max(8192).nullish(),
    fields: z.array(z.object({
      slug: z.string().max(160),
      value: z.string().max(5000).nullish(),
    })).max(200).default([]),
  }),
});

export type SystemeContactInput = {
  external_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  property_address: string | null;
  city: string | null;
  region: string | null;
  province: string | null;
  property_type: string | null;
};

export function normalizeSystemePageUrl(value: string | null | undefined) {
  if (!value?.trim() || value.length > 8192) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    const normalized = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    return normalized.length <= 2048 ? normalized : null;
  } catch {
    return null;
  }
}

export function parseSystemeOptIn(rawBody: string): {
  contact: SystemeContactInput | null;
  sourcePageUrl: string | null;
  rejectionReason: string | null;
} {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return { contact: null, sourcePageUrl: null, rejectionReason: "invalid_payload" }; }
  const result = optInSchema.safeParse(parsed);
  if (!result.success) return { contact: null, sourcePageUrl: null, rejectionReason: "invalid_payload" };
  const input = result.data.contact;
  const fields = new Map(input.fields.map((field) => [field.slug.trim().toLowerCase(), field.value?.trim() || null]));
  const text = (slugs: string[], max: number) => {
    for (const slug of slugs) {
      const value = fields.get(slug);
      if (value) return value.slice(0, max);
    }
    return null;
  };
  const sourcePageUrl = normalizeSystemePageUrl(input.sourceURL);
  const fullName = text(["full_name", "name"], 140)
    ?? [text(["first_name"], 140), text(["last_name", "surname"], 140)].filter(Boolean).join(" ").slice(0, 140);
  if (fullName.length < 2) return { contact: null, sourcePageUrl, rejectionReason: "missing_name" };
  return {
    sourcePageUrl,
    rejectionReason: null,
    contact: {
      external_id: String(input.id),
      full_name: fullName,
      email: input.email.toLowerCase(),
      phone: text(["phone_number", "phone"], 50),
      property_address: text(["property_address", "street_address", "address"], 300),
      city: text(["city"], 120),
      region: text(["region"], 100),
      province: text(["province"], 100),
      property_type: text(["property_type"], 80),
    },
  };
}
