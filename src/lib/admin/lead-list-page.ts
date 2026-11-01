import { z } from "zod";
import { readPagination, buildPagination } from "@/lib/api/pagination";

export const leadListFilterSchema = z.enum([
  "all", "completion", "duplicates", "pending", "prime", "published", "sold", "expired", "rejected",
]);
export type LeadListFilter = z.infer<typeof leadListFilterSchema>;
type Stats = { waitingCompletion: number; duplicates: number; newLeads: number; pending: number;
  prime: number; published: number; sold: number; expired: number; rejected: number };
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: { code?: string; message?: string } | null;
}> };

export async function fetchLeadListPage(client: unknown, params: URLSearchParams) {
  const filter = leadListFilterSchema.parse(params.get("filter"));
  const pagination = readPagination(params);
  const { data, error } = await (client as RpcClient).rpc("admin_lead_list_page_v1", {
    p_filter: filter, p_search: params.get("search")?.trim() ?? "",
    p_page: Math.min(pagination.page, 2_147_483_647), p_page_size: pagination.pageSize,
  });
  if (error?.code === "PGRST202" || error?.code === "42883") return null;
  if (error) throw error;
  const result = data as { ownerRequestIds?: unknown; total?: unknown; stats?: Stats } | null;
  if (!result || !Array.isArray(result.ownerRequestIds) ||
      !result.ownerRequestIds.every((id) => z.string().uuid().safeParse(id).success) ||
      result.ownerRequestIds.length > pagination.pageSize ||
      !Number.isSafeInteger(result.total) || Number(result.total) < 0 || !result.stats) {
    throw new Error("Risposta elenco lead non valida.");
  }
  return { ownerRequestIds: result.ownerRequestIds as string[], stats: result.stats,
    pagination: buildPagination(pagination.page, pagination.pageSize, Number(result.total)) };
}
