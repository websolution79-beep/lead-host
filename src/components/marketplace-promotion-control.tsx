"use client";

import { useState } from "react";
import { Megaphone, UserRoundX } from "lucide-react";
import { leadAssigneeColors } from "@/lib/admin/lead-assignment-types";
import type { MarketplaceLeadPromotion, MarketplacePromotionsSnapshot } from "@/lib/team-compensation/marketplace-promotion-types";

export function MarketplacePromotionControl({ leadId, title, snapshot, promotion, canWrite, pending, error, now, onChange }: {
  leadId: string; title: string; snapshot: MarketplacePromotionsSnapshot | null;
  promotion?: MarketplaceLeadPromotion; canWrite: boolean; pending: boolean; error?: string;
  now: number; onChange: (leadId: string, revision: string, action: "claim" | "release", memberId?: string) => void;
}) {
  const [memberId, setMemberId] = useState("");
  const current = promotion?.promoter;
  const colors = leadAssigneeColors(current?.badgeColor);
  const ready = Boolean(snapshot?.storageReady && snapshot.engineReady && snapshot.enabled);
  const waiting = Math.max(0, Math.ceil(((promotion?.availableAt ? Date.parse(promotion.availableAt) : 0) - now) / 60_000));
  const assigned = promotion?.state === "assigned";
  const converted = promotion?.state === "converted";
  const chosen = memberId || (assigned ? current?.memberId : "") || "";
  const validCandidate = Boolean(snapshot?.candidates.some((person) => person.memberId === chosen));
  const allowed = Boolean(ready && canWrite && promotion?.eligible && waiting === 0 && !pending && !converted);
  const claimAllowed = allowed && (snapshot?.canManageAll ? validCandidate : Boolean(snapshot?.candidates.length && !assigned));
  const label = !snapshot ? "Caricamento..." : !snapshot.storageReady ? "Non disponibile" : !ready ? "Promozione disattivata" : converted ? "Compenso gia attribuito" : !promotion?.eligible ? "Non disponibile" : waiting > 0 ? `Disponibile tra ${waiting} min` : "Vendi il Lead";

  return <div className="grid min-w-0 gap-2 text-sm" data-promotion-control>
    {current ? <span className="inline-flex min-w-0 items-start gap-1.5 break-words rounded-md border px-2 py-1 font-semibold" style={{ color: colors.text, borderColor: colors.accent, backgroundColor: `${colors.accent}0D` }}>
      <Megaphone size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>Promosso da {current.name}</span>
    </span> : null}
    {snapshot?.canManageAll && !converted && canWrite ? <select
      className="form-input min-h-11 w-full min-w-0 text-sm"
      aria-label={`Promotore per ${title}`} value={chosen} disabled={!allowed}
      onChange={(event) => setMemberId(event.target.value)}
    >
      <option value="">Scegli membro</option>
      {assigned && current && !snapshot.candidates.some((person) => person.memberId === current.memberId) ? <option value={current.memberId} disabled>{current.name} (non disponibile)</option> : null}
      {snapshot.candidates.map((person) => <option key={person.memberId} value={person.memberId}>{person.name}</option>)}
    </select> : null}
    {(!assigned || snapshot?.canManageAll) && !converted ? <button
      className="btn btn-secondary min-h-11 w-full min-w-0 whitespace-normal px-3 text-sm disabled:opacity-60"
      type="button" disabled={!claimAllowed || Boolean(assigned && chosen === current?.memberId)}
      onClick={() => onChange(leadId, promotion?.revision ?? "0", "claim", snapshot?.canManageAll ? chosen : undefined)}
    ><Megaphone size={16} className="shrink-0" />{pending ? "Salvataggio..." : assigned && ready ? "Riassegna" : label}</button> : null}
    {assigned && snapshot?.canManageAll && canWrite ? <button
      type="button" className="inline-flex min-h-11 items-center justify-center gap-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
      disabled={pending || !snapshot.storageReady}
      onClick={() => { if (window.confirm(`Rilasciare la promozione di ${title}?`)) onChange(leadId, promotion?.revision ?? "0", "release"); }}
    ><UserRoundX size={15} />Rilascia</button> : null}
    {error ? <p role="alert" className="break-words text-xs font-semibold text-red-700">{error}</p> : null}
  </div>;
}
