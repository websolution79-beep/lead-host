import type {
  AdminAccessLevel,
  AdminPermissionKey,
  AdminPermissionMap,
} from "@/lib/admin/permissions";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type TeamPermissionRow = {
  permission_key: AdminPermissionKey;
  access_level: AdminAccessLevel;
};

type TeamRoleRow = {
  id: string;
  name: string;
  is_active: boolean;
  team_role_permissions: TeamPermissionRow[] | null;
};

type TeamMemberWithRole = {
  id: string;
  status: "invited" | "active" | "suspended";
  must_change_password: boolean;
  role_id: string;
  team_roles: TeamRoleRow | TeamRoleRow[] | null;
};

export type TeamAccess = {
  memberId: string;
  roleId: string;
  roleName: string;
  status: "active" | "suspended";
  mustChangePassword: boolean;
  permissions: AdminPermissionMap;
};

export async function getTeamAccessForProfile(
  profileId: string,
): Promise<TeamAccess | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("team_members")
    .select(
      "id,status,must_change_password,role_id,team_roles(id,name,is_active,team_role_permissions(permission_key,access_level))",
    )
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const member = data as unknown as TeamMemberWithRole;

  if (member.status === "invited") {
    const joinedAt = new Date().toISOString();
    const { error: activateError } = await supabase
      .from("team_members")
      .update({
        status: "active",
        joined_at: joinedAt,
      })
      .eq("id", member.id)
      .eq("status", "invited");

    if (activateError) {
      return null;
    }

    member.status = "active";
  }

  if (member.status !== "active") {
    return {
      memberId: member.id,
      roleId: member.role_id,
      roleName: "",
      status: "suspended",
      mustChangePassword: member.must_change_password,
      permissions: {},
    };
  }

  const role = Array.isArray(member.team_roles)
    ? member.team_roles[0]
    : member.team_roles;

  if (!role?.is_active) {
    return null;
  }

  const permissions = Object.fromEntries(
    (role.team_role_permissions ?? []).map((permission) => [
      permission.permission_key,
      permission.access_level,
    ]),
  ) as AdminPermissionMap;

  return {
    memberId: member.id,
    roleId: role.id,
    roleName: role.name,
    status: "active",
    mustChangePassword: member.must_change_password,
    permissions,
  };
}
