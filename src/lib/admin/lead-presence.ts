export const LEAD_PRESENCE_HEARTBEAT_MS = 30000;
export const LEAD_PRESENCE_TTL_MS = 180000;

export type LeadViewer = { profileId: string; name: string; badgeColor: string | null; expiresAt: string };
export type LeadPresenceSnapshot = { status: "active" | "inactive" | "closed"; serverNow: string; participants: LeadViewer[] };

export function activeLeadViewers(snapshot: LeadPresenceSnapshot | null, receivedAt: number, now: number) {
  if (!snapshot || snapshot.status !== "active") return [];
  const serverNow = Date.parse(snapshot.serverNow);
  const elapsed = Math.max(0, now - receivedAt);
  return snapshot.participants.filter((person, index, people) => {
    const remaining = Math.min(LEAD_PRESENCE_TTL_MS, Date.parse(person.expiresAt) - serverNow);
    return Number.isFinite(remaining) && remaining > elapsed && people.findIndex((item) => item.profileId === person.profileId) === index;
  });
}
