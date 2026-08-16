import { NextResponse, type NextRequest } from "next/server";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireAdminPermission,
} from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";

export async function GET(request: NextRequest) {
  try {
    const context = await requireAdminPermission(request, "leads", "write");
    const { supabase, isSuperAdmin, permissions, teamMemberId } = context;

    if (
      !isSuperAdmin &&
      !hasAdminPermission(permissions, "prime", "write")
    ) {
      throw new AdminApiError(
        403,
        "Non hai il permesso di assegnare lead alla Prime Zone.",
      );
    }

    const now = new Date().toISOString();
    let accountsQuery = supabase
      .from("prime_accounts")
      .select(
        "id,profile_id,account_manager_member_id,status,prime_expires_at",
      )
      .eq("status", "active")
      .or(`prime_expires_at.is.null,prime_expires_at.gt.${now}`);

    if (!isSuperAdmin) {
      if (!teamMemberId) {
        throw new AdminApiError(403, "Portafoglio PRIME non disponibile.");
      }
      accountsQuery = accountsQuery.eq(
        "account_manager_member_id",
        teamMemberId,
      );
    }

    const { data: accounts, error: accountsError } = await accountsQuery;
    if (accountsError) throw accountsError;

    const profileIds = (accounts ?? []).map((account) => account.profile_id);
    if (!profileIds.length) {
      return NextResponse.json(
        { targets: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const managerIds = Array.from(
      new Set(
        (accounts ?? [])
          .map((account) => account.account_manager_member_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const [profilesResult, pmProfilesResult, walletsResult, managersResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,first_name,last_name,status")
          .in("id", profileIds)
          .eq("status", "active"),
        supabase
          .from("property_manager_profiles")
          .select("id,profile_id,primary_city")
          .in("profile_id", profileIds),
        supabase
          .from("wallets")
          .select("profile_id,balance_cents,currency")
          .in("profile_id", profileIds),
        managerIds.length
          ? supabase
              .from("team_members")
              .select("id,profile_id")
              .in("id", managerIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    const queryError =
      profilesResult.error ??
      pmProfilesResult.error ??
      walletsResult.error ??
      managersResult.error;
    if (queryError) throw queryError;

    const managerProfileIds = (managersResult.data ?? []).map(
      (member) => member.profile_id,
    );
    const managerProfilesResult = managerProfileIds.length
      ? await supabase
          .from("profiles")
          .select("id,email,first_name,last_name")
          .in("id", managerProfileIds)
      : { data: [], error: null };
    if (managerProfilesResult.error) throw managerProfilesResult.error;

    const profilesById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const pmProfilesByProfileId = new Map(
      (pmProfilesResult.data ?? []).map((profile) => [
        profile.profile_id,
        profile,
      ]),
    );
    const walletsByProfileId = new Map(
      (walletsResult.data ?? []).map((wallet) => [wallet.profile_id, wallet]),
    );
    const managerProfilesById = new Map(
      (managerProfilesResult.data ?? []).map((profile) => [
        profile.id,
        profile,
      ]),
    );
    const managersById = new Map(
      (managersResult.data ?? []).map((member) => [
        member.id,
        managerProfilesById.get(member.profile_id) ?? null,
      ]),
    );

    const targets = (accounts ?? [])
      .map((account) => {
        const profile = profilesById.get(account.profile_id);
        const pmProfile = pmProfilesByProfileId.get(account.profile_id);
        if (!profile || !pmProfile) return null;
        const wallet = walletsByProfileId.get(account.profile_id) ?? null;
        const manager = account.account_manager_member_id
          ? managersById.get(account.account_manager_member_id) ?? null
          : null;

        return {
          propertyManagerId: pmProfile.id,
          profileId: profile.id,
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
          primaryCity: pmProfile.primary_city,
          primeStatus: account.status,
          primeExpiresAt: account.prime_expires_at,
          walletBalanceCents: wallet?.balance_cents ?? 0,
          walletCurrency: wallet?.currency ?? "EUR",
          accountManager: manager
            ? {
                firstName: manager.first_name,
                lastName: manager.last_name,
                email: manager.email,
              }
            : null,
        };
      })
      .filter((target): target is NonNullable<typeof target> => Boolean(target))
      .sort((left, right) =>
        `${left.firstName ?? ""} ${left.lastName ?? ""}`.localeCompare(
          `${right.firstName ?? ""} ${right.lastName ?? ""}`,
          "it",
        ),
      );

    return NextResponse.json(
      { targets },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
