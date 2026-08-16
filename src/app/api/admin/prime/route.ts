import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireAdminPermission,
} from "@/lib/admin/auth";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_eligibility"),
    profileId: z.string().uuid(),
    enabled: z.boolean(),
    notes: z.string().trim().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("manage_access"),
    profileId: z.string().uuid(),
    accessAction: z.enum(["activate", "suspend", "deactivate"]),
    expiresAt: z.string().datetime().nullable().optional(),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("assign_manager"),
    profileId: z.string().uuid(),
    memberId: z.string().uuid().nullable(),
  }),
]);

type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: "active" | "suspended";
  created_at: string;
};

type PmProfileRow = {
  profile_id: string;
  primary_city: string | null;
  managed_properties_range: string | null;
};

type TeamMemberRow = {
  id: string;
  profile_id: string;
  role_id: string;
  badge_color: string;
};

export async function GET(request: NextRequest) {
  try {
    const context = await requireAdminPermission(request, "prime", "read");
    const { supabase, isSuperAdmin, teamMemberId, permissions } = context;
    const search = normalizeSearch(request.nextUrl.searchParams.get("search"));
    const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
    const pageSize = 25;

    const { data: pmRoles, error: pmRolesError } = await supabase
      .from("user_roles")
      .select("profile_id")
      .eq("role", "property_manager");

    if (pmRolesError) throw pmRolesError;

    let availableProfileIds = Array.from(
      new Set((pmRoles ?? []).map((row) => row.profile_id)),
    );

    if (!isSuperAdmin) {
      if (!teamMemberId) {
        throw new AdminApiError(403, "Portafoglio PRIME non disponibile.");
      }

      const { data: assignedAccounts, error: assignedError } = await supabase
        .from("prime_accounts")
        .select("profile_id")
        .eq("account_manager_member_id", teamMemberId);

      if (assignedError) throw assignedError;
      const assignedIds = new Set((assignedAccounts ?? []).map((row) => row.profile_id));
      availableProfileIds = availableProfileIds.filter((id) => assignedIds.has(id));
    }

    const [profilesResult, pmProfilesResult, walletsResult, eligibilitiesResult, accountsResult] =
      availableProfileIds.length
        ? await Promise.all([
            supabase
              .from("profiles")
              .select("id,email,first_name,last_name,phone,status,created_at")
              .in("id", availableProfileIds),
            supabase
              .from("property_manager_profiles")
              .select("profile_id,primary_city,managed_properties_range")
              .in("profile_id", availableProfileIds),
            supabase
              .from("wallets")
              .select("profile_id,balance_cents,currency")
              .in("profile_id", availableProfileIds),
            supabase
              .from("prime_eligibilities")
              .select("*")
              .in("profile_id", availableProfileIds),
            supabase
              .from("prime_accounts")
              .select("*")
              .in("profile_id", availableProfileIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];

    const storageError =
      profilesResult.error ??
      pmProfilesResult.error ??
      walletsResult.error ??
      eligibilitiesResult.error ??
      accountsResult.error;
    if (storageError) throw storageError;

    const pmProfilesById = new Map(
      ((pmProfilesResult.data ?? []) as PmProfileRow[]).map((row) => [row.profile_id, row]),
    );
    const walletsById = new Map(
      (walletsResult.data ?? []).map((row) => [row.profile_id, row]),
    );
    const eligibilitiesById = new Map(
      (eligibilitiesResult.data ?? []).map((row) => [row.profile_id, row]),
    );
    const accountsById = new Map(
      (accountsResult.data ?? []).map((row) => [row.profile_id, row]),
    );

    const allRows = ((profilesResult.data ?? []) as ProfileRow[])
      .map((profile) => {
        const pmProfile = pmProfilesById.get(profile.id);
        const wallet = walletsById.get(profile.id);
        const eligibility = eligibilitiesById.get(profile.id) ?? null;
        const account = accountsById.get(profile.id) ?? null;
        return {
          profile,
          pmProfile: pmProfile ?? null,
          wallet: wallet ?? null,
          eligibility,
          account,
        };
      })
      .filter((row) => matchesSearch(row, search))
      .sort((left, right) => {
        const leftRank = primeRank(left.account?.status);
        const rightRank = primeRank(right.account?.status);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return profileName(left.profile).localeCompare(profileName(right.profile), "it");
      });

    const total = allRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    const pageRows = allRows.slice(offset, offset + pageSize);
    const pageProfileIds = pageRows.map((row) => row.profile.id);

    const { managers, managersById } = await loadPrimeManagers(supabase);
    const eventsResult = pageProfileIds.length
      ? await supabase
          .from("prime_account_events")
          .select("*")
          .in("profile_id", pageProfileIds)
          .order("created_at", { ascending: false })
          .limit(pageProfileIds.length * 20)
      : { data: [], error: null };
    if (eventsResult.error) throw eventsResult.error;

    const eventsByProfile = new Map<string, typeof eventsResult.data>();
    for (const event of eventsResult.data ?? []) {
      const current = eventsByProfile.get(event.profile_id) ?? [];
      if (current.length < 20) current.push(event);
      eventsByProfile.set(event.profile_id, current);
    }

    return NextResponse.json(
      {
        access: {
          isSuperAdmin,
          canWrite: isSuperAdmin || permissions.prime === "write",
          canAssignManager: isSuperAdmin,
        },
        stats: {
          total: allRows.length,
          eligible: allRows.filter((row) => row.eligibility?.is_enabled).length,
          active: allRows.filter((row) => row.account?.status === "active").length,
          pastDue: allRows.filter((row) => row.account?.status === "past_due").length,
          suspended: allRows.filter((row) => row.account?.status === "suspended").length,
        },
        managers,
        propertyManagers: pageRows.map((row) => ({
          ...row,
          accountManager: row.account?.account_manager_member_id
            ? managersById.get(row.account.account_manager_member_id) ?? null
            : null,
          events: eventsByProfile.get(row.profile.id) ?? [],
        })),
        pagination: {
          page: safePage,
          pageSize,
          total,
          totalPages,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireAdminPermission(request, "prime", "write");
    const payload = patchSchema.parse(await request.json());
    const { supabase, profile, isSuperAdmin, teamMemberId } = context;

    await ensurePropertyManager(supabase, payload.profileId);
    await ensurePrimeScope({
      supabase,
      profileId: payload.profileId,
      isSuperAdmin,
      teamMemberId,
    });

    if (payload.action === "assign_manager" && !isSuperAdmin) {
      throw new AdminApiError(
        403,
        "Solo il Super Admin può assegnare o cambiare Account Manager.",
      );
    }

    const beforeResult = await supabase
      .from("prime_accounts")
      .select("*")
      .eq("profile_id", payload.profileId)
      .maybeSingle();
    if (beforeResult.error) throw beforeResult.error;

    if (payload.action === "set_eligibility") {
      const { error } = await supabase.rpc("admin_set_prime_eligibility", {
        p_profile_id: payload.profileId,
        p_enabled: payload.enabled,
        p_actor_profile_id: profile.id,
        p_notes: payload.notes ?? null,
      });
      if (error) throw error;
    } else if (payload.action === "manage_access") {
      const { error } = await supabase.rpc("admin_manage_prime_access", {
        p_profile_id: payload.profileId,
        p_action: payload.accessAction,
        p_actor_profile_id: profile.id,
        p_expires_at: payload.expiresAt ?? null,
        p_reason: payload.reason,
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.rpc("admin_assign_prime_manager", {
        p_profile_id: payload.profileId,
        p_member_id: payload.memberId,
        p_actor_profile_id: profile.id,
      });
      if (error) throw error;
    }

    const afterResult = await supabase
      .from("prime_accounts")
      .select("*")
      .eq("profile_id", payload.profileId)
      .maybeSingle();
    if (afterResult.error) throw afterResult.error;

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "prime_account",
      entityId: afterResult.data?.id ?? payload.profileId,
      action: `prime.${payload.action}`,
      before: beforeResult.data,
      after: afterResult.data,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Operazione PRIME non valida." },
        { status: 422 },
      );
    }
    return adminApiErrorResponse(error);
  }
}

function normalizeSearch(value: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("it-IT");
}

function profileName(profile: ProfileRow) {
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
}

function matchesSearch(
  row: {
    profile: ProfileRow;
    pmProfile: PmProfileRow | null;
  },
  search: string,
) {
  if (!search) return true;
  return [
    row.profile.first_name,
    row.profile.last_name,
    row.profile.email,
    row.profile.phone,
    row.pmProfile?.primary_city,
  ].some((value) => value?.toLocaleLowerCase("it-IT").includes(search));
}

function primeRank(status: string | null | undefined) {
  return {
    active: 0,
    past_due: 1,
    suspended: 2,
    inactive: 3,
    cancelled: 4,
  }[status ?? "inactive"] ?? 5;
}

async function ensurePropertyManager(
  supabase: Parameters<typeof loadPrimeManagers>[0],
  profileId: string,
) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("role", "property_manager")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AdminApiError(404, "Property Manager non trovato.");
}

async function ensurePrimeScope({
  supabase,
  profileId,
  isSuperAdmin,
  teamMemberId,
}: {
  supabase: Parameters<typeof loadPrimeManagers>[0];
  profileId: string;
  isSuperAdmin: boolean;
  teamMemberId: string | null;
}) {
  if (isSuperAdmin) return;
  if (!teamMemberId) throw new AdminApiError(403, "Portafoglio PRIME non disponibile.");

  const { data, error } = await supabase
    .from("prime_accounts")
    .select("id")
    .eq("profile_id", profileId)
    .eq("account_manager_member_id", teamMemberId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new AdminApiError(403, "Questo Property Manager non appartiene al tuo portafoglio.");
  }
}

async function loadPrimeManagers(
  supabase: Awaited<ReturnType<typeof requireAdminPermission>>["supabase"],
) {
  const { data: primeRolePermissions, error: permissionsError } = await supabase
    .from("team_role_permissions")
    .select("role_id,access_level")
    .eq("permission_key", "prime");
  if (permissionsError) throw permissionsError;

  const roleIds = Array.from(new Set((primeRolePermissions ?? []).map((row) => row.role_id)));
  if (!roleIds.length) return { managers: [], managersById: new Map() };

  const [membersResult, rolesResult] = await Promise.all([
    supabase
      .from("team_members")
      .select("id,profile_id,role_id,badge_color")
      .eq("status", "active")
      .in("role_id", roleIds),
    supabase.from("team_roles").select("id,name").in("id", roleIds),
  ]);
  if (membersResult.error) throw membersResult.error;
  if (rolesResult.error) throw rolesResult.error;

  const members = (membersResult.data ?? []) as TeamMemberRow[];
  const profileIds = members.map((member) => member.profile_id);
  const profilesResult = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id,email,first_name,last_name")
        .in("id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;

  const profilesById = new Map((profilesResult.data ?? []).map((row) => [row.id, row]));
  const rolesById = new Map((rolesResult.data ?? []).map((row) => [row.id, row.name]));
  const managers = members
    .map((member) => {
      const managerProfile = profilesById.get(member.profile_id);
      return {
        memberId: member.id,
        profileId: member.profile_id,
        name:
          [managerProfile?.first_name, managerProfile?.last_name].filter(Boolean).join(" ") ||
          managerProfile?.email ||
          "Membro Team",
        email: managerProfile?.email ?? "",
        roleName: rolesById.get(member.role_id) ?? "Team",
        badgeColor: member.badge_color,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "it"));

  return {
    managers,
    managersById: new Map(managers.map((manager) => [manager.memberId, manager])),
  };
}
