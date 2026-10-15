import { z } from "zod";
import { normalizeSystemePageUrl } from "./payload";
import { selectSystemeFlow, type SystemeFieldBinding, type SystemeFlow } from "./flows";

const envelopeSchema = z.object({ contact: z.object({
  id: z.union([z.number().int().positive().safe(), z.string().regex(/^\d{1,160}$/)]),
  email: z.string().max(5000).nullish(),
  sourceURL: z.string().max(8192).nullish(),
  fields: z.array(z.object({
    slug: z.string().trim().toLowerCase().min(1).max(160),
    fieldName: z.string().max(160).nullish(),
    value: z.string().max(5000).nullish(),
  })).max(200).default([]),
}) });

export type SystemeFlowEnvelope = {
  externalId: string;
  sourcePageUrl: string | null;
  fields: { slug: string; label: string | null; value: string | null }[];
};

export type SystemeMappingWarning = {
  field: string;
  code: "invalid_number" | "invalid_email" | "invalid_value" | "value_truncated" | "unmapped_field" | "missing_required_field";
};

export type SystemeMappedContact = {
  external_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  property_address: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqm: number | null;
  current_status: string | null;
  requested_services: string[];
  timing: string | null;
  property_description: string | null;
};

export type SystemeAdditionalAnswer = { fieldKey: string; label: string; value: string };

// This is a pure parser. Signature, account access and discovery-window checks belong at the server boundary.
export function parseSystemeFlowEnvelope(rawBody: string): SystemeFlowEnvelope | null {
  if (new TextEncoder().encode(rawBody).byteLength > 256 * 1024) return null;
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return null; }
  const parsed = envelopeSchema.safeParse(payload);
  if (!parsed.success) return null;
  const input = parsed.data.contact;
  const fields = new Map<string, SystemeFlowEnvelope["fields"][number]>();
  for (const field of input.fields) {
    if (fields.has(field.slug)) return null;
    fields.set(field.slug, { slug: field.slug, label: field.fieldName?.trim() || null, value: field.value?.trim() || null });
  }
  // Systeme.io exposes the canonical email outside the custom-fields array.
  if (input.email != null) fields.set("email", { slug: "email", label: "Email", value: input.email.trim() || null });
  return { externalId: String(input.id), sourcePageUrl: normalizeSystemePageUrl(input.sourceURL), fields: [...fields.values()] };
}

export function systemeDiscoveryMetadata(envelope: SystemeFlowEnvelope) {
  return envelope.fields.map((field) => ({ sourcePageUrl: envelope.sourcePageUrl, sourceSlug: field.slug, fieldLabel: field.label }));
}

const aliases = [
  ["full_name", ["full_name", "name"]], ["first_name", ["first_name"]], ["last_name", ["last_name", "surname"]],
  ["email", ["email"]], ["phone", ["phone_number", "phone"]],
  ["property_address", ["property_address", "street_address", "address"]],
  ["city", ["city"]], ["province", ["province"]], ["region", ["region"]], ["property_type", ["property_type"]],
  ["bedrooms", ["bedrooms"]], ["bathrooms", ["bathrooms"]], ["area_sqm", ["area_sqm"]],
  ["current_status", ["current_status"]], ["requested_services", ["requested_services"]],
  ["timing", ["timing"]], ["property_description", ["property_description"]],
] satisfies [SystemeFieldBinding["targetField"], string[]][];

export function suggestSystemeFieldBindings(envelope: SystemeFlowEnvelope): SystemeFieldBinding[] {
  const sources = new Set(envelope.fields.map((field) => field.slug));
  const hasFullName = ["full_name", "name"].some((slug) => sources.has(slug));
  return aliases.flatMap(([targetField, slugs]) => {
    if (hasFullName && (targetField === "first_name" || targetField === "last_name")) return [];
    const sourceSlug = slugs.find((slug) => sources.has(slug));
    return sourceSlug ? [{ sourceSlug, targetField, additionalLabel: null }] : [];
  });
}

export function mapSystemeFlowContact(envelope: SystemeFlowEnvelope, flow: SystemeFlow): {
  contact: SystemeMappedContact | null;
  additionalAnswers: SystemeAdditionalAnswer[];
  warnings: SystemeMappingWarning[];
  rejectionReason: "missing_name" | "missing_email" | "invalid_email" | null;
} {
  const values = new Map(envelope.fields.map((field) => [field.slug, field.value]));
  const bindings = new Map(flow.bindings.map((binding) => [binding.targetField, binding]));
  const warnings: SystemeMappingWarning[] = [];
  const warn = (field: string, code: SystemeMappingWarning["code"]) => {
    if (warnings.length < 50 && !warnings.some((warning) => warning.field === field && warning.code === code)) warnings.push({ field, code });
  };
  const read = (target: SystemeFieldBinding["targetField"]) => {
    const binding = bindings.get(target);
    return binding ? values.get(binding.sourceSlug) ?? null : null;
  };
  const warnTarget = (target: SystemeFieldBinding["targetField"], code: SystemeMappingWarning["code"]) => warn(bindings.get(target)?.sourceSlug ?? target, code);
  const truncate = (value: string, max: number, field: string) => {
    if (value.length <= max) return value;
    warn(field, "value_truncated");
    return Array.from(value).slice(0, max).join("");
  };
  const text = (target: SystemeFieldBinding["targetField"], max: number) => {
    const value = read(target);
    return value ? truncate(value, max, bindings.get(target)!.sourceSlug) : null;
  };
  const integer = (target: "bedrooms" | "bathrooms" | "area_sqm", min: number, max: number) => {
    const value = read(target);
    if (!value) return null;
    const number = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) {
      warnTarget(target, "invalid_number");
      return null;
    }
    return number;
  };

  const fullName = bindings.has("full_name") ? text("full_name", 140) ?? ""
    : truncate([text("first_name", 140), text("last_name", 140)].filter(Boolean).join(" "), 140, "full_name");
  const email = read("email")?.toLowerCase() ?? null;
  const validEmail = z.string().email().max(255).safeParse(email).success;
  if (fullName.length < 2) warnTarget(bindings.has("full_name") ? "full_name" : "first_name", "missing_required_field");
  if (!email) warnTarget("email", "missing_required_field");
  else if (!validEmail) warnTarget("email", "invalid_email");

  let requestedServices: string[] = [];
  const serviceValue = read("requested_services");
  if (serviceValue) {
    let parsed: unknown;
    try { parsed = serviceValue.startsWith("[") ? JSON.parse(serviceValue) : serviceValue.split(/[,;\n]+/); } catch { parsed = null; }
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) warnTarget("requested_services", "invalid_value");
    else {
      const entries = [...new Set((parsed as string[]).map((value) => value.trim()).filter(Boolean))];
      if (entries.length > 20) warnTarget("requested_services", "value_truncated");
      requestedServices = entries.slice(0, 20).map((value) => truncate(value, 120, bindings.get("requested_services")!.sourceSlug));
    }
  }

  const contact: SystemeMappedContact = {
    external_id: envelope.externalId,
    full_name: fullName,
    email: email ?? "",
    phone: text("phone", 50),
    property_address: text("property_address", 300),
    city: text("city", 120),
    province: text("province", 100),
    region: text("region", 100),
    property_type: text("property_type", 80),
    bedrooms: integer("bedrooms", 0, 99),
    bathrooms: integer("bathrooms", 0, 99),
    area_sqm: integer("area_sqm", 1, 100000),
    current_status: text("current_status", 120),
    requested_services: requestedServices,
    timing: text("timing", 120),
    property_description: text("property_description", 5000),
  };
  const additionalAnswers = flow.bindings.flatMap((binding) => {
    const value = values.get(binding.sourceSlug);
    return binding.targetField === "additional" && binding.additionalLabel && value
      ? [{ fieldKey: `${flow.id}:${binding.sourceSlug}`, label: binding.additionalLabel, value }] : [];
  });
  const mappedSources = new Set(flow.bindings.map((binding) => binding.sourceSlug));
  for (const field of envelope.fields) if (field.value && !mappedSources.has(field.slug)) warn(field.slug, "unmapped_field");

  const rejectionReason = fullName.length < 2 ? "missing_name" : !email ? "missing_email" : !validEmail ? "invalid_email" : null;
  return { contact: rejectionReason ? null : contact, additionalAnswers: rejectionReason ? [] : additionalAnswers, warnings, rejectionReason };
}

export function planSystemeFlowImport(enabled: boolean, flows: readonly SystemeFlow[], envelope: SystemeFlowEnvelope | null) {
  if (!enabled) return { flow: null, rejectionReason: "connection_disabled" as const, mapped: null };
  if (!envelope) return { flow: null, rejectionReason: "invalid_payload" as const, mapped: null };
  const flow = selectSystemeFlow(flows, envelope.sourcePageUrl);
  if (!flow) return { flow: null, rejectionReason: "page_filtered" as const, mapped: null };
  if (!flow.enabled) return { flow, rejectionReason: "flow_paused" as const, mapped: null };
  const mapped = mapSystemeFlowContact(envelope, flow);
  return { flow, rejectionReason: mapped.rejectionReason, mapped };
}
