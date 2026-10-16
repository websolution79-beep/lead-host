"use client";

import { UserCheck } from "lucide-react";
import { leadAssigneeColors, type LeadAssignment, type LeadAssignmentsSnapshot } from "@/lib/admin/lead-assignment-types";

export function LeadAssignmentControl({ ownerRequestId, title, snapshot, assignment, disabled, onChange }: {
  ownerRequestId: string;
  title: string;
  snapshot: LeadAssignmentsSnapshot | null;
  assignment?: LeadAssignment;
  disabled: boolean;
  onChange: (assigneeProfileId: string | null, expectedRevision: string) => void;
}) {
  const current = assignment?.assignee;
  const colors = leadAssigneeColors(current?.badgeColor);
  const available = Boolean(snapshot?.storageReady);
  const occupiedByOther = Boolean(current && current.profileId !== snapshot?.actorProfileId && !snapshot?.canManageAll);
  const canChoose = Boolean(available && snapshot?.candidates.length && !occupiedByOther);
  const ownCandidates = snapshot?.candidates ?? [];
  const unavailableCurrent = current && !ownCandidates.some((person) => person.profileId === current.profileId);
  const inputId = `lead-assignment-${ownerRequestId}`;

  return <div className="mt-4 border-t border-slate-200 px-4 pb-4 pt-3" data-assignment-control>
    <label htmlFor={canChoose ? inputId : undefined} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
      <UserCheck size={15} aria-hidden="true" />Preso in carico da:
    </label>
    {canChoose ? <select
      id={inputId}
      aria-label={`Preso in carico da: ${title}`}
      title={current?.name ?? "Non assegnato"}
      className="form-input mt-2 min-h-11 w-full min-w-0 text-ellipsis text-sm font-semibold disabled:opacity-60"
      style={current ? { color: colors.text, borderColor: colors.accent, backgroundColor: `${colors.accent}0D` } : undefined}
      value={current?.profileId ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null, assignment?.revision ?? "0")}
    >
      <option value="">Non assegnato</option>
      {unavailableCurrent ? <option value={current.profileId} disabled>{current.name} (non disponibile)</option> : null}
      {ownCandidates.map((person) => <option key={person.profileId} value={person.profileId}>{person.name}</option>)}
    </select> : <p className="mt-2 flex min-h-11 items-center gap-2 break-words text-sm font-semibold" style={{ color: colors.text }}>
      {current ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors.accent }} /> : null}
      <span>{!snapshot ? "Caricamento..." : !available ? "Non disponibile" : current?.name ?? "Non assegnato"}</span>
    </p>}
  </div>;
}
