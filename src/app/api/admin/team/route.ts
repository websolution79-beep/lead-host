import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import {
  ADMIN_PERMISSION_KEYS,
  type AdminPermissionKey,
} from "@/lib/admin/permissions";
import { getRequestAppUrl } from "@/lib/env";

const accessLevelSchema = z.enum(["read", "write"]);
const permissionSchema = z.object({
  key: z.enum(ADMIN_PERMISSION_KEYS),
  accessLevel: accessLevelSchema,
});
const roleFieldsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable(),
  isActive: z.boolean(),
  permissions: z.array(permissionSchema).max(ADMIN_PERMISSION_KEYS.length),
});
const memberFieldsSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  roleId: z.string().uuid(),
});

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_role"),
    role: roleFieldsSchema,
  }),
  z.object({
    action: z.literal("invite_member"),
    member: memberFieldsSchema,
  }),
  z.object({
    action: z.literal("create_member"),
    member: memberFieldsSchema.extend({
      password: z.string().min(12).max(128),
    }),
  }),
]);

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_role"),
    roleId: z.string().uuid(),
    role: roleFieldsSchema,
  }),
  z.object({
    action: z.literal("update_member"),
    memberId: z.string().uuid(),
    roleId: z.string().uuid(),
    status: z.enum(["active", "suspended"]),
  }),
]);

const deleteSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete_role"),
    roleId: z.string().uuid(),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [permissionsResult, rolesResult, rolePermissionsResult, membersResult] =
      await Promise.all([
        supabase.from("team_permissions").select("*").order("sort_order"),
        supabase.from("team_roles").select("*").order("name"),
        supabase.from("team_role_permissions").select("*"),
        supabase.from("team_members").select("*").order("created_at", {
          ascending: false,
        }),
      ]);

    const storageError =
      permissionsResult.error ??
      rolesResult.error ??
      rolePermissionsResult.error ??
      membersResult.error;

    if (storageError) throw storageError;

    const profileIds = (membersResult.data ?? []).map((member) => member.profile_id);
    const profilesResult = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id,email,first_name,last_name,status,created_at")
          .in("id", profileIds)
      : { data: [], error: null };

    if (profilesResult.error) throw profilesResult.error;

    const profilesById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const rolePermissions = rolePermissionsResult.data ?? [];
    const roles = (rolesResult.data ?? []).map((role) => ({
      ...role,
      permissions: rolePermissions
        .filter((permission) => permission.role_id === role.id)
        .map((permission) => ({
          key: permission.permission_key,
          accessLevel: permission.access_level,
        })),
    }));
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    const members = (membersResult.data ?? []).map((member) => ({
      ...member,
      profile: profilesById.get(member.profile_id) ?? null,
      role: rolesById.get(member.role_id) ?? null,
    }));

    return NextResponse.json({
      permissions: permissionsResult.data ?? [],
      roles,
      members,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = postSchema.safeParse(await request.json());

    if (!payload.success) {
      throw new AdminApiError(422, "Dati Team non validi.");
    }

    if (payload.data.action === "create_role") {
      const role = await createRole({
        supabase,
        actorProfileId: profile.id,
        role: payload.data.role,
      });
      await writeTeamAudit(supabase, profile.id, "team.role_created", role.id, {
        name: role.name,
      });

      return NextResponse.json({ role }, { status: 201 });
    }

    const creationMode =
      payload.data.action === "invite_member" ? "invite" : "manual";
    const memberInput = payload.data.member;
    await ensureRoleIsActive(supabase, memberInput.roleId);
    await ensureEmailIsAvailable(supabase, memberInput.email);

    const metadata = {
      account_type: "team",
      first_name: memberInput.firstName,
      last_name: memberInput.lastName,
    };
    const authResult =
      creationMode === "invite"
        ? await supabase.auth.admin.inviteUserByEmail(memberInput.email, {
            redirectTo: `${getRequestAppUrl(request)}/auth/callback?next=/admin`,
            data: metadata,
          })
        : await supabase.auth.admin.createUser({
            email: memberInput.email,
            password: payload.data.action === "create_member"
              ? payload.data.member.password
              : undefined,
            email_confirm: true,
            user_metadata: metadata,
          });

    if (authResult.error || !authResult.data.user) {
      throw new AdminApiError(
        422,
        friendlyAuthError(authResult.error?.message),
      );
    }

    const authUserId = authResult.data.user.id;

    try {
      const memberProfile = await findProfileForAuthUser(supabase, authUserId);
      const now = new Date().toISOString();
      const { data: member, error: memberError } = await supabase
        .from("team_members")
        .insert({
          profile_id: memberProfile.id,
          role_id: memberInput.roleId,
          status: creationMode === "invite" ? "invited" : "active",
          creation_mode: creationMode,
          must_change_password: true,
          invited_by: profile.id,
          invited_at: now,
          joined_at: creationMode === "manual" ? now : null,
        })
        .select("*")
        .single();

      if (memberError || !member) {
        throw memberError ?? new Error("Membro Team non creato.");
      }

      await writeTeamAudit(
        supabase,
        profile.id,
        creationMode === "invite"
          ? "team.member_invited"
          : "team.member_created_manually",
        member.id,
        {
          email: memberInput.email,
          role_id: memberInput.roleId,
        },
      );

      return NextResponse.json({ member }, { status: 201 });
    } catch (error) {
      await supabase.auth.admin.deleteUser(authUserId);
      throw error;
    }
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = patchSchema.safeParse(await request.json());

    if (!payload.success) {
      throw new AdminApiError(422, "Dati Team non validi.");
    }

    if (payload.data.action === "update_role") {
      const { roleId, role } = payload.data;
      const { data: updatedRole, error } = await supabase
        .from("team_roles")
        .update({
          name: role.name,
          description: role.description,
          is_active: role.isActive,
          updated_by: profile.id,
        })
        .eq("id", roleId)
        .select("*")
        .single();

      if (error || !updatedRole) {
        throw new AdminApiError(422, friendlyDatabaseError(error?.message));
      }

      await syncRolePermissions(supabase, roleId, role.permissions);
      await writeTeamAudit(supabase, profile.id, "team.role_updated", roleId, {
        name: role.name,
        is_active: role.isActive,
      });

      return NextResponse.json({ role: updatedRole });
    }

    await ensureRoleIsActive(supabase, payload.data.roleId);
    const suspendedAt =
      payload.data.status === "suspended" ? new Date().toISOString() : null;
    const { data: member, error } = await supabase
      .from("team_members")
      .update({
        role_id: payload.data.roleId,
        status: payload.data.status,
        suspended_at: suspendedAt,
      })
      .eq("id", payload.data.memberId)
      .select("*")
      .single();

    if (error || !member) {
      throw new AdminApiError(404, "Membro Team non trovato.");
    }

    await writeTeamAudit(
      supabase,
      profile.id,
      payload.data.status === "suspended"
        ? "team.member_suspended"
        : "team.member_updated",
      member.id,
      {
        role_id: payload.data.roleId,
        status: payload.data.status,
      },
    );

    return NextResponse.json({ member });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, profile } = await requireSuperAdmin(request);
    const payload = deleteSchema.safeParse(await request.json());

    if (!payload.success) {
      throw new AdminApiError(422, "Ruolo Team non valido.");
    }

    const { count, error: membersError } = await supabase
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("role_id", payload.data.roleId);

    if (membersError) throw membersError;

    if ((count ?? 0) > 0) {
      throw new AdminApiError(
        409,
        "Il ruolo è assegnato a uno o più membri. Cambia prima il loro ruolo.",
      );
    }

    const { error } = await supabase
      .from("team_roles")
      .delete()
      .eq("id", payload.data.roleId);

    if (error) {
      throw new AdminApiError(422, friendlyDatabaseError(error.message));
    }

    await writeTeamAudit(
      supabase,
      profile.id,
      "team.role_deleted",
      payload.data.roleId,
      {},
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

type TeamSupabase = Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"];
type RoleInput = z.infer<typeof roleFieldsSchema>;

async function createRole({
  supabase,
  actorProfileId,
  role,
}: {
  supabase: TeamSupabase;
  actorProfileId: string;
  role: RoleInput;
}) {
  const { data, error } = await supabase
    .from("team_roles")
    .insert({
      name: role.name,
      description: role.description,
      is_active: role.isActive,
      created_by: actorProfileId,
      updated_by: actorProfileId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AdminApiError(422, friendlyDatabaseError(error?.message));
  }

  try {
    await syncRolePermissions(supabase, data.id, role.permissions);
    return data;
  } catch (error) {
    await supabase.from("team_roles").delete().eq("id", data.id);
    throw error;
  }
}

async function syncRolePermissions(
  supabase: TeamSupabase,
  roleId: string,
  permissions: RoleInput["permissions"],
) {
  const uniquePermissions = new Map<AdminPermissionKey, "read" | "write">();

  for (const permission of permissions) {
    uniquePermissions.set(permission.key, permission.accessLevel);
  }

  const rows = Array.from(uniquePermissions, ([permission_key, access_level]) => ({
    role_id: roleId,
    permission_key,
    access_level,
  }));

  if (rows.length) {
    const { error: upsertError } = await supabase
      .from("team_role_permissions")
      .upsert(rows, { onConflict: "role_id,permission_key" });

    if (upsertError) throw upsertError;
  }

  const keys = rows.map((row) => row.permission_key);
  let deleteQuery = supabase
    .from("team_role_permissions")
    .delete()
    .eq("role_id", roleId);

  if (keys.length) {
    deleteQuery = deleteQuery.not("permission_key", "in", `(${keys.join(",")})`);
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) throw deleteError;
}

async function ensureRoleIsActive(supabase: TeamSupabase, roleId: string) {
  const { data, error } = await supabase
    .from("team_roles")
    .select("id,is_active")
    .eq("id", roleId)
    .maybeSingle();

  if (error || !data) {
    throw new AdminApiError(422, "Ruolo Team non trovato.");
  }

  if (!data.is_active) {
    throw new AdminApiError(422, "Il ruolo Team selezionato non è attivo.");
  }
}

async function ensureEmailIsAvailable(supabase: TeamSupabase, email: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    throw new AdminApiError(
      409,
      "Questa email è già associata a un account Lead Host.",
    );
  }
}

async function findProfileForAuthUser(
  supabase: TeamSupabase,
  authUserId: string,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  throw new Error("Profilo Team non creato dal trigger di autenticazione.");
}

async function writeTeamAudit(
  supabase: TeamSupabase,
  actorProfileId: string,
  action: string,
  entityId: string,
  after: Record<string, unknown>,
) {
  const auditLogs = supabase.from("audit_logs" as never) as unknown as {
    insert: (row: Record<string, unknown>) => Promise<{ error?: unknown }>;
  };

  await auditLogs.insert({
    actor_profile_id: actorProfileId,
    actor_role: "super_admin",
    entity_type: "team",
    entity_id: entityId,
    action,
    before: null,
    after,
  });
}

function friendlyAuthError(message?: string) {
  if (!message) return "Non è stato possibile creare il membro Team.";
  if (/already|registered|exists/i.test(message)) {
    return "Questa email è già associata a un account.";
  }
  return "Non è stato possibile creare il membro Team. Controlla i dati e riprova.";
}

function friendlyDatabaseError(message?: string) {
  if (message && /team_roles_name_unique_idx|duplicate key/i.test(message)) {
    return "Esiste già un ruolo Team con questo nome.";
  }
  return "Non è stato possibile salvare il ruolo Team.";
}
