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
  z.object({
    action: z.literal("claim_manager"),
    profileId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("update_internal_notes"),
    profileId: z.string().uuid(),
    notes: z.string().max(5000),
  }),
  z.object({
    action: z.literal("update_interest_locations"),
    profileId: z.string().uuid(),
    interestLocations: z.array(z.string().trim().min(1).max(80)).max(20),
  }),
]);

const managedPropertiesFilterSchema = z.enum([
  "starting_now",
  "one_to_three",
  "four_to_ten",
  "more_than_ten",
  "not_indicated",
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
  managed_properties_count: number | null;
};

type TeamMemberRow = {
  id: string;
  profile_id: string;
  role_id: string;
  badge_color: string;
};

type PrimeInterestLocationsRow = {
  profile_id: string;
  interest_locations: string[];
};

export async function GET(request: NextRequest) {
  try {
    const context = await requireAdminPermission(request, "prime", "read");
    const { supabase, isSuperAdmin, teamMemberId, permissions } = context;
    const detailProfileId = request.nextUrl.searchParams.get("profileId");

    if (detailProfileId) {
      const parsedProfileId = z.string().uuid().parse(detailProfileId);
      await ensurePropertyManager(supabase, parsedProfileId);
      const assignedManagerId = await ensurePrimeScope({
        supabase,
        profileId: parsedProfileId,
        isSuperAdmin,
        teamMemberId,
        allowUnassigned: true,
      });
      const detail = await loadPrimePropertyManagerDetail(
        supabase,
        parsedProfileId,
        isSuperAdmin || assignedManagerId === teamMemberId,
      );
      return NextResponse.json(
        { detail },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const search = normalizeSearch(request.nextUrl.searchParams.get("search"));
    const managedPropertiesFilter = managedPropertiesFilterSchema
      .optional()
      .catch(undefined)
      .parse(request.nextUrl.searchParams.get("managedProperties") || undefined);
    const scope = request.nextUrl.searchParams.get("scope") ??
      (isSuperAdmin ? "all" : "unassigned");
    const subscriberStatus = request.nextUrl.searchParams.get("subscriberStatus") ?? "all";
    const subscriberManagerId = z.string().uuid().optional().catch(undefined).parse(
      request.nextUrl.searchParams.get("subscriberManagerId") || undefined,
    );
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

      const { data: portfolioAccounts, error: assignedError } = await supabase
        .from("prime_accounts")
        .select("profile_id,account_manager_member_id")
        .in("profile_id", availableProfileIds);

      if (assignedError) throw assignedError;
      const managerByProfileId = new Map(
        (portfolioAccounts ?? []).map((row) => [
          row.profile_id,
          row.account_manager_member_id,
        ]),
      );
      availableProfileIds = availableProfileIds.filter((id) => {
        const managerId = managerByProfileId.get(id) ?? null;
        return managerId === null || managerId === teamMemberId;
      });
    }

    const [profilesResult, pmProfilesResult, walletsResult, eligibilitiesResult, accountsResult, subscriptionsResult, interestLocationsResult] =
      availableProfileIds.length
        ? await Promise.all([
            supabase
              .from("profiles")
              .select("id,email,first_name,last_name,phone,status,created_at")
              .in("id", availableProfileIds),
            supabase
              .from("property_manager_profiles")
              .select("profile_id,primary_city,managed_properties_range,managed_properties_count")
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
            supabase
              .from("addon_subscriptions")
              .select("id,profile_id,status,source,current_period_ends_at,cancel_at_period_end,canceled_at,updated_at")
              .in("profile_id", availableProfileIds)
              .order("updated_at", { ascending: false }),
            supabase
              .from("prime_internal_notes")
              .select("profile_id,interest_locations")
              .in("profile_id", availableProfileIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
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
      accountsResult.error ??
      subscriptionsResult.error ??
      interestLocationsResult.error;
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
    const interestLocationsByProfileId = new Map(
      ((interestLocationsResult.data ?? []) as PrimeInterestLocationsRow[]).map((row) => [
        row.profile_id,
        row.interest_locations ?? [],
      ]),
    );
    const subscriptionsById = new Map<
      string,
      NonNullable<typeof subscriptionsResult.data>[number]
    >();
    for (const subscription of subscriptionsResult.data ?? []) {
      subscriptionsById.set(subscription.id, subscription);
    }

    const allRows = ((profilesResult.data ?? []) as ProfileRow[])
      .map((profile) => {
        const pmProfile = pmProfilesById.get(profile.id);
        const wallet = walletsById.get(profile.id);
        const eligibility = eligibilitiesById.get(profile.id) ?? null;
        const account = accountsById.get(profile.id) ?? null;
        const subscription = account?.addon_subscription_id
          ? subscriptionsById.get(account.addon_subscription_id) ?? null
          : null;
        const canReadInterestLocations =
          isSuperAdmin || account?.account_manager_member_id === teamMemberId;
        return {
          profile,
          pmProfile: pmProfile ?? null,
          wallet: wallet ?? null,
          eligibility,
          account,
          subscription,
          interestLocations: canReadInterestLocations
            ? interestLocationsByProfileId.get(profile.id) ?? []
            : [],
        };
      });

    const visibleRows = allRows
      .filter((row) => matchesSearch(row, search))
      .filter((row) => matchesManagedProperties(row.pmProfile, managedPropertiesFilter))
      .filter((row) => {
        const managerId = row.account?.account_manager_member_id ?? null;
        if (scope === "unassigned") return managerId === null;
        if (scope === "mine") return Boolean(teamMemberId && managerId === teamMemberId);
        if (scope === "assigned") return managerId !== null;
        if (scope === "subscribers") {
          const isSubscriber = Boolean(
            row.account &&
            row.account.access_source !== "none" &&
            row.account.prime_started_at,
          );
          if (!isSubscriber) return false;
          if (!isSuperAdmin && row.account?.account_manager_member_id !== teamMemberId) {
            return false;
          }
          if (subscriberManagerId && row.account?.account_manager_member_id !== subscriberManagerId) {
            return false;
          }
          return matchesSubscriberStatus(row, subscriberStatus);
        }
        return true;
      })
      .sort((left, right) => {
        const leftRank = primeRank(left.account?.status);
        const rightRank = primeRank(right.account?.status);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return profileName(left.profile).localeCompare(profileName(right.profile), "it");
      });

    const total = visibleRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;
    const pageRows = visibleRows.slice(offset, offset + pageSize);
    const pageProfileIds = pageRows.map((row) => row.profile.id);

    const billingResult = pageProfileIds.length
      ? await supabase
          .from("prime_billing_periods")
          .select("profile_id,status,total_amount_cents,membership_amount_cents,wallet_recharge_amount_cents,paid_at")
          .in("profile_id", pageProfileIds)
      : { data: [], error: null };
    if (billingResult.error) throw billingResult.error;
    const billingByProfileId = new Map<string, {
      totalPaidCents: number;
      paymentCount: number;
      lastPaymentAt: string | null;
    }>();
    for (const period of billingResult.data ?? []) {
      if (period.status !== "paid") continue;
      const current = billingByProfileId.get(period.profile_id) ?? {
        totalPaidCents: 0,
        paymentCount: 0,
        lastPaymentAt: null,
      };
      current.totalPaidCents += period.total_amount_cents;
      current.paymentCount += 1;
      if (period.paid_at && (!current.lastPaymentAt || period.paid_at > current.lastPaymentAt)) {
        current.lastPaymentAt = period.paid_at;
      }
      billingByProfileId.set(period.profile_id, current);
    }

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
          teamMemberId,
        },
        stats: {
          total: allRows.length,
          eligible: allRows.filter((row) => row.eligibility?.is_enabled).length,
          active: allRows.filter((row) => row.account?.status === "active").length,
          pastDue: allRows.filter((row) => row.account?.status === "past_due").length,
          suspended: allRows.filter((row) => row.account?.status === "suspended").length,
          subscribers: allRows.filter((row) =>
            Boolean(row.account?.access_source !== "none" && row.account?.prime_started_at),
          ).length,
        },
        managers,
        propertyManagers: pageRows.map((row) => ({
          ...row,
          accountManager: row.account?.account_manager_member_id
            ? managersById.get(row.account.account_manager_member_id) ?? null
            : null,
          interestLocations: row.interestLocations,
          subscriptionSummary: {
            currentPeriodEndsAt: row.subscription?.current_period_ends_at ?? row.account?.prime_expires_at ?? null,
            cancelAtPeriodEnd: row.subscription?.cancel_at_period_end ?? false,
            canceledAt: row.subscription?.canceled_at ?? null,
            totalPaidCents: billingByProfileId.get(row.profile.id)?.totalPaidCents ?? 0,
            paymentCount: billingByProfileId.get(row.profile.id)?.paymentCount ?? 0,
            lastPaymentAt: billingByProfileId.get(row.profile.id)?.lastPaymentAt ?? null,
          },
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

function matchesSubscriberStatus(
  row: {
    account: { status: string; prime_expires_at: string | null; grace_ends_at: string | null } | null;
    subscription: { cancel_at_period_end: boolean; current_period_ends_at: string | null } | null;
  },
  status: string,
) {
  if (status === "all") return true;
  if (status === "active") {
    return row.account?.status === "active" && !row.subscription?.cancel_at_period_end;
  }
  if (status === "expiring") {
    const value = row.subscription?.current_period_ends_at ?? row.account?.prime_expires_at;
    if (!value || row.account?.status !== "active") return false;
    const remaining = new Date(value).getTime() - Date.now();
    return remaining >= 0 && remaining <= 7 * 86_400_000;
  }
  if (status === "canceling") return Boolean(row.subscription?.cancel_at_period_end);
  if (status === "attention") return row.account?.status === "past_due";
  if (status === "cancelled") return row.account?.status === "cancelled";
  return true;
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await requireAdminPermission(request, "prime", "write");
    const payload = patchSchema.parse(await request.json());
    const { supabase, profile, isSuperAdmin, teamMemberId } = context;

    await ensurePropertyManager(supabase, payload.profileId);
    if (payload.action !== "claim_manager") {
      await ensurePrimeScope({
        supabase,
        profileId: payload.profileId,
        isSuperAdmin,
        teamMemberId,
      });
    }

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

    if (payload.action === "update_internal_notes") {
      if (!beforeResult.data) {
        throw new AdminApiError(404, "Account PRIME non trovato.");
      }
      const previousNotesResult = await supabase
        .from("prime_internal_notes")
        .select("id,notes")
        .eq("profile_id", payload.profileId)
        .maybeSingle();
      if (previousNotesResult.error) throw previousNotesResult.error;

      const normalizedNotes = payload.notes.trim();
      const savedNotesResult = await supabase
        .from("prime_internal_notes")
        .upsert(
          {
            prime_account_id: beforeResult.data.id,
            profile_id: payload.profileId,
            notes: normalizedNotes,
            updated_by: profile.id,
          },
          { onConflict: "profile_id" },
        )
        .select("id,notes,updated_at")
        .single();
      if (savedNotesResult.error) throw savedNotesResult.error;

      await writeAdminAuditLog({
        supabase,
        request,
        actorProfileId: profile.id,
        isSuperAdmin,
        entityType: "prime_internal_note",
        entityId: savedNotesResult.data.id,
        action: "prime.update_internal_notes",
        before: { characters: previousNotesResult.data?.notes.length ?? 0 },
        after: { characters: normalizedNotes.length },
      });

      return NextResponse.json({
        ok: true,
        internalNotes: normalizedNotes,
        updatedAt: savedNotesResult.data.updated_at,
      });
    }

    if (payload.action === "update_interest_locations") {
      if (!beforeResult.data) {
        throw new AdminApiError(404, "Account PRIME non trovato.");
      }
      const previousLocationsResult = await supabase
        .from("prime_internal_notes")
        .select("id,interest_locations")
        .eq("profile_id", payload.profileId)
        .maybeSingle();
      if (previousLocationsResult.error) throw previousLocationsResult.error;

      const interestLocations = normalizeInterestLocations(payload.interestLocations);
      const savedLocationsResult = await supabase
        .from("prime_internal_notes")
        .upsert(
          {
            prime_account_id: beforeResult.data.id,
            profile_id: payload.profileId,
            interest_locations: interestLocations,
            updated_by: profile.id,
          },
          { onConflict: "profile_id" },
        )
        .select("id,interest_locations,updated_at")
        .single();
      if (savedLocationsResult.error) throw savedLocationsResult.error;

      await writeAdminAuditLog({
        supabase,
        request,
        actorProfileId: profile.id,
        isSuperAdmin,
        entityType: "prime_interest_locations",
        entityId: savedLocationsResult.data.id,
        action: "prime.update_interest_locations",
        before: { interest_locations: previousLocationsResult.data?.interest_locations ?? [] },
        after: { interest_locations: interestLocations },
      });

      return NextResponse.json({
        ok: true,
        interestLocations: savedLocationsResult.data.interest_locations,
        updatedAt: savedLocationsResult.data.updated_at,
      });
    }

    if (payload.action === "claim_manager") {
      if (isSuperAdmin || !teamMemberId) {
        throw new AdminApiError(422, "Usa l'assegnazione amministrativa per questo profilo.");
      }
      const { error } = await supabase.rpc("claim_prime_property_manager", {
        p_profile_id: payload.profileId,
        p_member_id: teamMemberId,
        p_actor_profile_id: profile.id,
      });
      if (error) {
        if (error.message.includes("gia stato preso in carico")) {
          throw new AdminApiError(409, "Questo Property Manager è già stato preso in carico.");
        }
        throw error;
      }
    } else if (payload.action === "set_eligibility") {
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
    interestLocations: string[];
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
    ...row.interestLocations,
  ].some((value) => value?.toLocaleLowerCase("it-IT").includes(search));
}

function normalizeInterestLocations(values: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const location = value.trim().replace(/\s+/g, " ");
    const key = location.toLocaleLowerCase("it-IT");
    if (!location || seen.has(key)) continue;
    seen.add(key);
    normalized.push(location);
  }

  return normalized.slice(0, 20);
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
  allowUnassigned = false,
}: {
  supabase: Parameters<typeof loadPrimeManagers>[0];
  profileId: string;
  isSuperAdmin: boolean;
  teamMemberId: string | null;
  allowUnassigned?: boolean;
}) {
  if (isSuperAdmin) return null;
  if (!teamMemberId) throw new AdminApiError(403, "Portafoglio PRIME non disponibile.");

  const { data, error } = await supabase
    .from("prime_accounts")
    .select("id,account_manager_member_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.account_manager_member_id && allowUnassigned) return null;
  if (!data?.account_manager_member_id) {
    throw new AdminApiError(403, "Prendi prima in carico questo Property Manager.");
  }
  if (data?.account_manager_member_id && data.account_manager_member_id !== teamMemberId) {
    throw new AdminApiError(403, "Questo Property Manager non appartiene al tuo portafoglio.");
  }
  return data.account_manager_member_id;
}

function matchesManagedProperties(
  pmProfile: PmProfileRow | null,
  filter: z.infer<typeof managedPropertiesFilterSchema> | undefined,
) {
  if (!filter) return true;
  const range = pmProfile?.managed_properties_range ?? null;
  const count = pmProfile?.managed_properties_count ?? null;
  if (filter === "not_indicated") return !range && count === null;
  if (range) return range === filter;
  if (filter === "starting_now") return count === 0;
  if (filter === "one_to_three") return count !== null && count >= 1 && count <= 3;
  if (filter === "four_to_ten") return count !== null && count >= 4 && count <= 10;
  return count !== null && count > 10;
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

async function loadPrimePropertyManagerDetail(
  supabase: Awaited<ReturnType<typeof requireAdminPermission>>["supabase"],
  profileId: string,
  includeInternalNotes: boolean,
) {
  const [profileResult, pmProfileResult, walletResult, billingResult, internalNotesResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .single(),
      supabase
        .from("property_manager_profiles")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle(),
      supabase.from("wallets").select("*").eq("profile_id", profileId).maybeSingle(),
      supabase
        .from("billing_profiles")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle(),
      includeInternalNotes
        ? supabase
            .from("prime_internal_notes")
            .select("notes,interest_locations,updated_at")
            .eq("profile_id", profileId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (profileResult.error) throw profileResult.error;
  if (pmProfileResult.error) throw pmProfileResult.error;
  if (walletResult.error) throw walletResult.error;
  if (billingResult.error) throw billingResult.error;
  if (internalNotesResult.error) throw internalNotesResult.error;

  const pmProfile = pmProfileResult.data;
  const [transactionsResult, purchasesResult, reportsResult, primeBillingResult] = await Promise.all([
    supabase
      .from("wallet_transactions")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100),
    pmProfile
      ? supabase
          .from("lead_purchases")
          .select("*")
          .eq("property_manager_id", pmProfile.id)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    pmProfile
      ? supabase
          .from("reports")
          .select("id,subject,reason,details,status,created_at,reviewed_at")
          .eq("property_manager_id", pmProfile.id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("prime_billing_periods")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (transactionsResult.error) throw transactionsResult.error;
  if (purchasesResult.error) throw purchasesResult.error;
  if (reportsResult.error) throw reportsResult.error;
  if (primeBillingResult.error) throw primeBillingResult.error;

  const purchases = purchasesResult.data ?? [];
  const leadIds = Array.from(new Set(purchases.map((purchase) => purchase.lead_id)));
  const leadsResult = leadIds.length
    ? await supabase.from("leads").select("id,title").in("id", leadIds)
    : { data: [], error: null };
  if (leadsResult.error) throw leadsResult.error;
  const leadTitleById = new Map((leadsResult.data ?? []).map((lead) => [lead.id, lead.title]));

  const authUserResult = profileResult.data.auth_user_id
    ? await supabase.auth.admin.getUserById(profileResult.data.auth_user_id)
    : { data: { user: null }, error: null };
  if (authUserResult.error) throw authUserResult.error;

  const completedPurchases = purchases.filter((purchase) =>
    ["paid", "contact_unlocked"].includes(purchase.status),
  );

  return {
    profile: profileResult.data,
    propertyManagerProfile: pmProfile,
    wallet: walletResult.data,
    billingProfile: billingResult.data,
    internalNotes: internalNotesResult.data?.notes ?? "",
    interestLocations: internalNotesResult.data?.interest_locations ?? [],
    internalNotesUpdatedAt: internalNotesResult.data?.updated_at ?? null,
    auth: {
      emailConfirmedAt: authUserResult.data.user?.email_confirmed_at ?? null,
      lastSignInAt: authUserResult.data.user?.last_sign_in_at ?? null,
      metadata: authUserResult.data.user?.user_metadata ?? {},
    },
    walletTransactions: transactionsResult.data ?? [],
    leadPurchases: purchases.map((purchase) => ({
      ...purchase,
      leadTitle: leadTitleById.get(purchase.lead_id) ?? "Lead acquistato",
    })),
    reports: reportsResult.data ?? [],
    primeBillingPeriods: primeBillingResult.data ?? [],
    stats: {
      completedPurchases: completedPurchases.length,
      totalSpentCents: completedPurchases.reduce(
        (total, purchase) => total + purchase.amount_cents,
        0,
      ),
      topUpsCents: (transactionsResult.data ?? [])
        .filter((transaction) => transaction.type === "top_up" && transaction.status === "completed")
        .reduce((total, transaction) => total + transaction.amount_cents, 0),
      openReports: (reportsResult.data ?? []).filter((report) =>
        ["pending", "reviewing"].includes(report.status),
      ).length,
      primePaidCents: (primeBillingResult.data ?? [])
        .filter((period) => period.status === "paid")
        .reduce((total, period) => total + period.total_amount_cents, 0),
      primeWalletCents: (primeBillingResult.data ?? [])
        .filter((period) => period.status === "paid")
        .reduce((total, period) => total + period.wallet_recharge_amount_cents, 0),
    },
  };
}
