export const ADMIN_PERMISSION_KEYS = [
  "marketplace",
  "dashboard",
  "leads",
  "acquisition",
  "property_managers",
  "prime",
  "support",
  "payments",
  "coupons",
  "billing",
  "refunds",
  "emails",
  "brevo",
  "telegram",
  "telegram_manual_publish",
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
  { href: "/admin/marketplace", permission: "marketplace" },
  { href: "/admin/leads", permission: "leads" },
  { href: "/admin/acquisizione", permission: "acquisition" },
  { href: "/admin/property-manager", permission: "property_managers" },
  { href: "/admin/prime-zone", permission: "prime" },
  { href: "/admin/prime", permission: "prime" },
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

const ADMIN_API_PERMISSION_ROUTES: Array<{
  prefix: string;
  permissions: AdminPermissionKey[];
}> = [
  { prefix: "/api/admin/wallet-transactions", permissions: ["billing"] },
  { prefix: "/api/admin/property-managers", permissions: ["property_managers"] },
  { prefix: "/api/admin/prime-zone", permissions: ["prime"] },
  { prefix: "/api/admin/prime", permissions: ["prime"] },
  { prefix: "/api/admin/email-templates", permissions: ["emails"] },
  { prefix: "/api/admin/email-recipients", permissions: ["emails"] },
  { prefix: "/api/admin/service-emails", permissions: ["emails"] },
  { prefix: "/api/admin/acquisition", permissions: ["acquisition"] },
  { prefix: "/api/admin/analytics", permissions: ["dashboard", "analytics"] },
  { prefix: "/api/admin/billing", permissions: ["billing"] },
  { prefix: "/api/admin/brevo", permissions: ["brevo"] },
  { prefix: "/api/admin/coupons", permissions: ["coupons"] },
  { prefix: "/api/admin/leads", permissions: ["leads"] },
  { prefix: "/api/admin/payments", permissions: ["payments"] },
  { prefix: "/api/admin/refunds", permissions: ["refunds"] },
  { prefix: "/api/admin/reports", permissions: ["support"] },
  { prefix: "/api/admin/settings", permissions: ["settings"] },
  { prefix: "/api/admin/telegram", permissions: ["telegram"] },
  { prefix: "/api/admin/tracking", permissions: ["tracking"] },
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

export function getAdminPagePermission(pathname: string) {
  if (pathname === "/admin") return "dashboard" satisfies AdminPermissionKey;

  return ADMIN_ROUTE_PERMISSIONS.find(
    ({ href }) => href !== "/admin" && pathname.startsWith(href),
  )?.permission;
}

export function getAdminApiPermissions(pathname: string) {
  return (
    ADMIN_API_PERMISSION_ROUTES.find(({ prefix }) => pathname.startsWith(prefix))
      ?.permissions ?? []
  );
}

export function getAdminApiAccessLevel(method: string): AdminAccessLevel {
  return method === "GET" || method === "HEAD" ? "read" : "write";
}
