import { buildPagination, readPagination } from "@/lib/api/pagination";
import { getManagedPropertiesLabel } from "@/lib/domain/pm-onboarding";

type PageRow = {
  profileId: string;
  managedPropertiesRange: string | null;
  managedPropertiesCount: number | null;
  [key: string]: unknown;
};
type PageResult = {
  total: number;
  propertyManagers: PageRow[];
  stats: { total: number; active: number; prime: number; suspended: number };
};
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}> };

export async function fetchPmListPage(
  client: unknown,
  params: URLSearchParams,
  search: string,
  managedProperties?: string,
) {
  const pagination = readPagination(params);
  const { data, error } = await (client as RpcClient).rpc("admin_pm_list_page_v1", {
    p_search: search,
    p_managed_properties: managedProperties ?? null,
    p_page: Math.min(pagination.page, 2_147_483_647),
    p_page_size: pagination.pageSize,
  });
  // Rolling deployment: the old implementation remains available before the
  // additive migration is applied. Operational failures must not trigger a
  // second expensive archive load.
  if (error?.code === "PGRST202" || error?.code === "42883") return null;
  if (error) throw error;
  const result = data as PageResult | null;
  if (!result || !Array.isArray(result.propertyManagers) ||
      !Number.isSafeInteger(result.total) || result.total < 0 || !result.stats) {
    throw new Error("Risposta elenco Property Manager non valida.");
  }
  return {
    propertyManagers: result.propertyManagers.map(({ managedPropertiesCount, ...row }) => ({
      ...row,
      managedPropertiesLabel: getManagedPropertiesLabel(row.managedPropertiesRange, managedPropertiesCount),
    })),
    pagination: buildPagination(pagination.page, pagination.pageSize, result.total),
    stats: result.stats,
  };
}
