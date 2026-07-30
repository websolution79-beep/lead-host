export const ADMIN_PERMISSION_KEYS = [
  "dashboard",
  "leads",
  "acquisition",
  "property_managers",
  "support",
  "payments",
  "coupons",
  "billing",
  "refunds",
  "emails",
  "brevo",
  "telegram",
  "analytics",
  "tracking",
  "settings",
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];
export type AdminAccessLevel = "read" | "write";
export type AdminPermissionMap = Partial<
  Record<AdminPermissionKey, AdminAccessLevel>
>;

export const ADMIN_ROUTE_PERMISSIONS: Array<{
  href: string;
  permission: AdminPermissionKey;
}> = [
  { href: "/admin/leads", permission: "leads" },
  { href: "/admin/acquisizione", permission: "acquisition" },
  { href: "/admin/property-manager", permission: "property_managers" },
  { href: "/admin/segnalazioni", permission: "support" },
  { href: "/admin/pagamenti", permission: "payments" },
  { href: "/admin/coupon", permission: "coupons" },
  { href: "/admin/fatturazione", permission: "billing" },
  { href: "/admin/rimborsi", permission: "refunds" },
  { href: "/admin/email-transazionali", permission: "emails" },
  { href: "/admin/brevo", permission: "brevo" },
  { href: "/admin/telegram", permission: "telegram" },
  { href: "/admin/analytics", permission: "analytics" },
  { href: "/admin/tracking", permission: "tracking" },
  { href: "/admin/impostazioni", permission: "settings" },
  { href: "/admin", permission: "dashboard" },
];

export function hasAdminPermission(
  permissions: AdminPermissionMap,
  permission: AdminPermissionKey,
  requiredLevel: AdminAccessLevel = "read",
) {
  const grantedLevel = permissions[permission];

  if (!grantedLevel) return false;

  return requiredLevel === "read" || grantedLevel === "write";
}

export function getFirstAllowedAdminRoute(permissions: AdminPermissionMap) {
  return (
    ADMIN_ROUTE_PERMISSIONS.find(({ permission }) =>
      hasAdminPermission(permissions, permission),
    )?.href ?? "/login"
  );
}
