export type LeadAssignee = {
  profileId: string;
  name: string;
  badgeColor: string | null;
};

export type LeadAssignment = {
  ownerRequestId: string;
  assignee: LeadAssignee | null;
  assignedAt: string | null;
  revision: string;
};

export type LeadAssignmentsSnapshot = {
  storageReady: boolean;
  actorProfileId: string;
  canManageAll: boolean;
  candidates: LeadAssignee[];
  assignments: LeadAssignment[];
};

export function leadAssigneeColors(color: string | null | undefined) {
  const accent = color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748B";
  let rgb = [1, 3, 5].map((index) => parseInt(accent.slice(index, index + 2), 16));
  // Keep the member's hue but ensure neon team colors are readable on white.
  const luminance = (values: number[]) => values.reduce((sum, channel, index) => {
    const value = channel / 255;
    return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  while (1.05 / (luminance(rgb) + 0.05) < 4.5) rgb = rgb.map((value) => Math.floor(value * 0.85));
  return { accent, text: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}` };
}
