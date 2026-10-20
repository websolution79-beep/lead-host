"use client";

import { AlertTriangle, UsersRound } from "lucide-react";
import { useLeadPresence } from "@/components/use-lead-presence";
import { leadAssigneeColors } from "@/lib/admin/lead-assignment-types";

export function LeadPresenceBanner({ ownerRequestId }: { ownerRequestId: string }) {
  const { participants, unavailable, loading } = useLeadPresence(ownerRequestId);
  if (loading) return <p role="status" className="my-3 text-xs text-muted">Verifica delle schede aperte...</p>;
  if (!participants.length && !unavailable) return null;
  return <div role="status" aria-live="polite" className="my-4 flex min-w-0 items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-700" />
    <div className="min-w-0 flex-1">
      {participants.length ? <>
        <p className="font-bold">Attenzione: questa scheda {participants.length === 1 ? "\u00e8 gi\u00e0 aperta da" : "\u00e8 aperta anche da"}:</p>
        <ul className="mt-2 flex flex-wrap gap-2">{participants.map((person) => {
          const color = leadAssigneeColors(person.badgeColor);
          return <li key={person.profileId} className="inline-flex max-w-full items-center gap-2 break-words rounded-md border bg-white px-2.5 py-1.5 font-semibold" style={{ borderColor: color.accent, color: color.text }}><UsersRound size={15} className="shrink-0" style={{ color: color.accent }} /><span className="min-w-0 break-words">{person.name}</span></li>;
        })}</ul>
        <p className="mt-2 leading-5">Verifica con {participants.length === 1 ? "il collega" : "i colleghi"} prima di chiamare il proprietario.</p>
      </> : null}
      {unavailable ? <p className={participants.length ? "mt-2 text-xs leading-5" : "leading-5"}>Controllo presenze momentaneamente non disponibile. Verifica con il team prima di chiamare.</p> : null}
    </div>
  </div>;
}
