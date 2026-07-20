export const reportReasonOptions = [
  { value: "phone_invalid", label: "Telefono inesistente" },
  { value: "email_invalid", label: "Email inesistente" },
  { value: "duplicate", label: "Lead duplicato" },
  { value: "property_unavailable", label: "Immobile non disponibile" },
  { value: "incomplete_data", label: "Dati incompleti" },
  { value: "other", label: "Altro" },
] as const;

export type ReportReason = (typeof reportReasonOptions)[number]["value"];

export type ReportStatus = "pending" | "reviewing" | "resolved" | "rejected";

export const reportStatusLabels: Record<ReportStatus, string> = {
  pending: "Inviata",
  reviewing: "In lavorazione",
  resolved: "Risolta",
  rejected: "Non accolta",
};

export function getReportReasonLabel(reason: string) {
  return reportReasonOptions.find((item) => item.value === reason)?.label ?? reason;
}

export function getReportStatusLabel(status: string) {
  return reportStatusLabels[status as ReportStatus] ?? status;
}
