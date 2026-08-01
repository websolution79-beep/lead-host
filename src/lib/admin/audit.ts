import type { NextRequest } from "next/server";
import type { AdminContext } from "@/lib/admin/auth";

type AdminSupabase = AdminContext["supabase"];

export async function writeAdminAuditLog({
  supabase,
  request,
  actorProfileId,
  isSuperAdmin,
  actorRole,
  entityType,
  entityId,
  action,
  before = null,
  after = null,
}: {
  supabase: AdminSupabase;
  request?: NextRequest;
  actorProfileId: string;
  isSuperAdmin: boolean;
  actorRole?: "super_admin" | "team_member" | "property_manager";
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  const auditLogs = supabase.from("audit_logs" as never) as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{
      error?: { message?: string } | null;
    }>;
  };
  const forwardedFor = request?.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;
  const userAgent = request?.headers.get("user-agent")?.slice(0, 1000) || null;
  const { error } = await auditLogs.insert({
    actor_profile_id: actorProfileId,
    actor_role: actorRole ?? (isSuperAdmin ? "super_admin" : "team_member"),
    entity_type: entityType,
    entity_id: entityId ?? null,
    action,
    before,
    after,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  if (error) {
    console.error("Admin audit log failed:", error.message ?? error);
  }
}
