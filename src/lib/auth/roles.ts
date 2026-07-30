export type AppRole = "property_manager" | "super_admin" | "team_member";

export function hasRole(roles: AppRole[], role: AppRole) {
  return roles.includes(role);
}

export function getDefaultRoute(roles: AppRole[]) {
  return hasRole(roles, "super_admin") || hasRole(roles, "team_member")
    ? "/admin"
    : "/app/marketplace";
}

export function formatCurrencyCents(amountCents: number, currency = "eur") {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
