export type CalendarViewer = { isSuperAdmin: boolean; memberId: string | null };

export function canManageCalendarEntry(viewer: CalendarViewer, memberId: string): boolean {
  return viewer.isSuperAdmin || (viewer.memberId !== null && viewer.memberId === memberId);
}
