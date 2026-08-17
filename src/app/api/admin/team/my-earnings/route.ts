import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adminApiErrorResponse,
  requireActiveTeamMember,
} from "@/lib/admin/auth";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase, teamMemberId } = await requireActiveTeamMember(request);
    const query = querySchema.parse({
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    });
    const rpc = supabase as unknown as {
      rpc: (
        fn: "get_team_member_earnings_dashboard",
        args: Record<string, unknown>,
      ) => Promise<{
        data: unknown;
        error: { message?: string } | null;
      }>;
    };
    const { data, error } = await rpc.rpc("get_team_member_earnings_dashboard", {
      p_member_id: teamMemberId,
      p_page: query.page,
      p_page_size: query.pageSize,
    });

    if (error || !data) {
      throw new Error(error?.message ?? "Guadagni non disponibili.");
    }

    return NextResponse.json(data);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
