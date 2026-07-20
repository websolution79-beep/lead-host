export type AppRole = "property_manager" | "super_admin";

export function hasRole(roles: AppRole[], role: AppRole) {
  return roles.includes(role);
}

export function getDefaultRoute(roles: AppRole[]) {
  return hasRole(roles, "super_admin") ? "/admin" : "/app/marketplace";
}

export function formatCurrencyCents(amountCents: number, currency = "eur") {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}
