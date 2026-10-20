export type LeadOperationalActivity = {
  at: string;
  kind: "pipeline_move" | "note_updated" | "information_updated";
  source: "tracked" | "audit";
};

export type ActivityRecord = { createdAt: string; operationalActivity?: LeadOperationalActivity | null };

export function compareLeadActivity(a: ActivityRecord, b: ActivityRecord) {
  const time = (record: ActivityRecord) => {
    const value = Date.parse(record.operationalActivity?.at ?? record.createdAt);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  return time(a) - time(b);
}

export function describeLeadActivity(record: ActivityRecord, now: number) {
  const activity = record.operationalActivity;
  const timestamp = activity?.at ?? record.createdAt;
  const milliseconds = Date.parse(timestamp);
  const days = Number.isFinite(milliseconds) ? Math.max(0, Math.floor((now - milliseconds) / 86400000)) : null;
  const available = record.operationalActivity !== undefined;
  return {
    label: !available ? "Ultima attivit\u00e0 non disponibile" : activity ? "Ultima attivit\u00e0" : "Nessuna attivit\u00e0 registrata",
    at: activity?.at ?? null,
    days: available ? days : null,
    tone: !available || days === null || days < 3 ? "neutral" : days < 7 ? "warning" : "danger",
    age: !available || days === null ? null : activity
      ? days < 1 ? "Attivit\u00e0 nelle ultime 24 ore" : `Fermo da ${days} ${days === 1 ? "giorno" : "giorni"}`
      : days < 1 ? "Arrivato nelle ultime 24 ore" : `Arrivato da ${days} ${days === 1 ? "giorno" : "giorni"}`,
    historical: activity?.source === "audit",
  };
}

type DataRow = Record<string, unknown> | null;
type EditPayload = {
  qualificationNotes?: string | null;
  contact?: Record<string, unknown>;
  property?: Record<string, unknown>;
  consents?: { privacy?: boolean; dataSharing?: boolean; marketing?: boolean };
  marketplace?: Record<string, unknown>;
};

export function detectLeadEditActivity(before: { request: NonNullable<DataRow>; contact: DataRow; property: DataRow; lead: DataRow }, edit: EditPayload): "note_updated" | "information_updated" | null {
  if (edit.qualificationNotes !== undefined && edit.qualificationNotes !== (before.request.qualification_notes ?? null)) return "note_updated";
  const contactFields = { firstName: "first_name", lastName: "last_name", email: "email", phone: "phone", preciseAddress: "precise_address" };
  const propertyFields = { region: "region", province: "province", city: "city", propertyType: "property_type", bedrooms: "bedrooms", bathrooms: "bathrooms", beds: "beds", areaSqm: "approximate_area_sqm", currentStatus: "current_status", requestedServices: "requested_services", timing: "timing", description: "description" };
  function changed(row: DataRow, values: Record<string, unknown> | undefined, fields: Record<string, string>) {
    return Object.entries(fields).some(([key, column]) => {
      if (values?.[key] === undefined) return false;
      const list = key === "currentStatus" || key === "requestedServices";
      const normalize = (value: unknown) => list ? Array.isArray(value) ? [...value].sort() : [] : value ?? null;
      return JSON.stringify(normalize(row?.[column])) !== JSON.stringify(normalize(values[key]));
    });
  }
  if (changed(before.contact, edit.contact, contactFields) || changed(before.property, edit.property, propertyFields)) return "information_updated";
  for (const [key, column] of Object.entries({ privacy: "privacy_consent_at", dataSharing: "data_sharing_consent_at", marketing: "marketing_consent_at" })) {
    const next = edit.consents?.[key as keyof NonNullable<EditPayload["consents"]>];
    if (next !== undefined && next !== Boolean(before.request[column])) return "information_updated";
  }
  if (changed(before.request, edit.marketplace, { ownerVerified: "owner_verified", sublettingAvailable: "subletting_available" })) return "information_updated";
  if (before.lead && changed(before.lead, edit.marketplace, { title: "title", sharedPriceCents: "shared_price_cents", exclusivePriceCents: "exclusive_price_cents" })) return "information_updated";
  return null;
}
