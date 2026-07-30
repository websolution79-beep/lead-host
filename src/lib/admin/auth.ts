import { NextResponse, type NextRequest } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";
import {
  hasAdminPermission,
  type AdminAccessLevel,
  type AdminPermissionKey,
  type AdminPermissionMap,
} from "@/lib/admin/permissions";
import { getTeamAccessForProfile } from "@/lib/admin/team-access";

type ServiceSupabaseClient = ReturnType<typeof createServiceSupabaseClient>;

export class AdminApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type AdminContext = {
  supabase: ServiceSupabaseClient;
  profile: Database["public"]["Tables"]["profiles"]["Row"];
  isSuperAdmin: boolean;
  permissions: AdminPermissionMap;
};

async function requireAdminContext(request: NextRequest): Promise<AdminContext> {
  const supabase = createServiceSupabaseClient();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new AdminApiError(401, "Sessione admin non trovata.");
  }

  const context = await getAuthenticatedProfileContext(token);

  if (!context) {
    throw new AdminApiError(401, "Sessione admin non valida.");
  }

  if (context.profile.status !== "active") {
    throw new AdminApiError(403, "Profilo admin non autorizzato.");
  }

  const isSuperAdmin = context.roles.includes("super_admin");

  if (isSuperAdmin) {
    return {
      supabase,
      profile: context.profile,
      isSuperAdmin: true,
      permissions: {},
    };
  }

  if (!context.roles.includes("team_member")) {
    throw new AdminApiError(403, "Accesso amministrativo non autorizzato.");
  }

  const teamAccess = await getTeamAccessForProfile(context.profile.id);

  if (!teamAccess || teamAccess.status !== "active") {
    throw new AdminApiError(403, "Account Team non attivo.");
  }

  if (teamAccess.mustChangePassword) {
    throw new AdminApiError(
      403,
      "Aggiorna la password temporanea prima di utilizzare l'area Team.",
    );
  }

  return {
    supabase,
    profile: context.profile,
    isSuperAdmin: false,
    permissions: teamAccess.permissions,
  };
}

export async function requireSuperAdmin(request: NextRequest): Promise<AdminContext> {
  const context = await requireAdminContext(request);

  if (!context.isSuperAdmin) {
    throw new AdminApiError(403, "Ruolo Super Admin richiesto.");
  }

  return context;
}

export async function requireAdminPermission(
  request: NextRequest,
  permission: AdminPermissionKey,
  requiredLevel: AdminAccessLevel = "read",
): Promise<AdminContext> {
  const context = await requireAdminContext(request);

  if (
    !context.isSuperAdmin &&
    !hasAdminPermission(context.permissions, permission, requiredLevel)
  ) {
    throw new AdminApiError(
      403,
      requiredLevel === "write"
        ? "Non hai il permesso di modificare questa sezione."
        : "Non hai il permesso di visualizzare questa sezione.",
    );
  }

  return context;
}

export function adminApiErrorResponse(error: unknown) {
  if (error instanceof AdminApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);

  return NextResponse.json(
    { error: "Errore interno nella gestione admin." },
    { status: 500 },
  );
}
