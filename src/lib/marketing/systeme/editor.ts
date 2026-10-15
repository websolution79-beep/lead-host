import { suggestSystemeFieldBindings } from "./flow-payload";
import { normalizeSystemePageUrl } from "./payload";
import { systemeFlowListSchema, type SystemeFieldBinding, type SystemeFlow, type SystemeFlowSnapshot, type SystemeKnownField } from "./flows";

export const systemeTargetLabels: Record<SystemeFieldBinding["targetField"], string> = {
  full_name: "Nome e cognome", first_name: "Nome", last_name: "Cognome", email: "Email", phone: "Telefono",
  property_address: "Indirizzo immobile", city: "Citta", province: "Provincia", region: "Regione", property_type: "Tipologia immobile",
  bedrooms: "Camere", bathrooms: "Bagni", area_sqm: "Superficie (mq)", current_status: "Stato immobile",
  requested_services: "Servizi richiesti", timing: "Quando iniziare", property_description: "Descrizione immobile",
  additional: "Risposta aggiuntiva", ignore: "Non importare",
};

export function knownFieldsForFlow(flow: SystemeFlow, known: SystemeKnownField[], flows: SystemeFlow[]) {
  const selected = new Set(flow.allowedPageUrls.map(normalizeSystemePageUrl).filter(Boolean));
  const reserved = new Set(flows.filter((item) => item.id !== flow.id && item.importMode === "selected_pages").flatMap((item) => item.allowedPageUrls));
  const fields = new Map<string, SystemeKnownField>();
  for (const field of known) {
    const matches = flow.importMode === "all" ? !reserved.has(field.sourcePageUrl) : selected.has(field.sourcePageUrl);
    if (matches && (!fields.has(field.sourceSlug) || !fields.get(field.sourceSlug)?.fieldLabel)) fields.set(field.sourceSlug, field);
  }
  return [...fields.values()].sort((a, b) => a.sourceSlug.localeCompare(b.sourceSlug));
}

export function addDiscoveredBindings(bindings: SystemeFieldBinding[], known: SystemeKnownField[]) {
  const result = bindings.map((binding) => ({ ...binding }));
  const suggested = suggestSystemeFieldBindings({ externalId: "0", sourcePageUrl: null,
    fields: known.map((field) => ({ slug: field.sourceSlug, label: field.fieldLabel, value: null })) });
  for (const field of known) {
    if (result.length >= 200 || result.some((binding) => binding.sourceSlug === field.sourceSlug)) continue;
    const target = suggested.find((binding) => binding.sourceSlug === field.sourceSlug)?.targetField;
    const nameConflict = (target === "full_name" && result.some((binding) => ["first_name", "last_name"].includes(binding.targetField)))
      || ((target === "first_name" || target === "last_name") && result.some((binding) => binding.targetField === "full_name"));
    const available = target && !nameConflict && !result.some((binding) => binding.targetField === target);
    result.push({ sourceSlug: field.sourceSlug, targetField: available ? target : "ignore", additionalLabel: null });
  }
  return result;
}

export function initialSystemeFlowBindings(known: SystemeKnownField[] = []) {
  if (known.length) return addDiscoveredBindings([], known);
  return [
    ["first_name", "first_name"], ["last_name", "last_name"], ["email", "email"], ["phone_number", "phone"],
    ["street_address", "property_address"], ["city", "city"], ["province", "province"], ["region", "region"], ["property_type", "property_type"],
  ].map(([sourceSlug, targetField]) => ({ sourceSlug, targetField: targetField as SystemeFieldBinding["targetField"], additionalLabel: null }));
}

export function duplicateSystemeFlow(flow: SystemeFlow, id: string, flows: SystemeFlow[]): SystemeFlow {
  const names = new Set(flows.map((item) => item.name.trim().toLowerCase()));
  let index = 1;
  let name: string;
  do { name = `${flow.name.slice(0, 80)} - copia${index === 1 ? "" : ` ${index}`}`; index++; } while (names.has(name.toLowerCase()));
  return { ...flow, id, name, enabled: false, importMode: "selected_pages",
    allowedPageUrls: flow.importMode === "all" ? [""] : [...flow.allowedPageUrls], bindings: flow.bindings.map((binding) => ({ ...binding })) };
}

export function validateSystemeEditorFlow(draft: SystemeFlow, snapshot: SystemeFlowSnapshot) {
  const others = snapshot.flows.filter((flow) => flow.id !== draft.id)
    .map((flow) => snapshot.routingMode === "legacy" ? { ...flow, enabled: false } : flow);
  return systemeFlowListSchema.safeParse([...others, draft]);
}
