import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireAdminPermission,
} from "@/lib/admin/auth";
import { getPrimeZoneLeadsForProfile } from "@/lib/domain/marketplace-leads";

export async function GET(request: NextRequest) {
  try {
    const { supabase, isSuperAdmin, teamMemberId } = await requireAdminPermission(
      request,
      "prime",
      "read",
    );

    let accountsQuery = supabase
      .from("prime_accounts")
      .select(
        "id,profile_id,account_manager_member_id,status,prime_started_at,prime_expires_at,grace_ends_at,addon_subscription_id",
      )
      .in("status", ["active", "past_due"])
      .neq("access_source", "none")
      .not("prime_started_at", "is", null);

    if (!isSuperAdmin) {
      if (!teamMemberId) {
        throw new AdminApiError(403, "Portafoglio PRIME non disponibile.");
      }
      accountsQuery = accountsQuery.eq("account_manager_member_id", teamMemberId);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;
    if (accountsError) throw accountsError;

    const now = Date.now();
    const visibleAccounts = (accounts ?? []).filter((account) => {
      if (account.status === "active") {
        return !account.prime_expires_at || new Date(account.prime_expires_at).getTime() > now;
      }
      return Boolean(account.grace_ends_at && new Date(account.grace_ends_at).getTime() > now);
    });
    const profileIds = visibleAccounts.map((account) => account.profile_id);
    if (!profileIds.length) {
      return NextResponse.json(
        { propertyManagers: [], selected: null, leads: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const [profilesResult, pmProfilesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,first_name,last_name")
        .in("id", profileIds),
      supabase
        .from("property_manager_profiles")
        .select("id,profile_id,primary_city")
        .in("profile_id", profileIds),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (pmProfilesResult.error) throw pmProfilesResult.error;

    const profilesById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const pmProfilesById = new Map(
      (pmProfilesResult.data ?? []).map((profile) => [profile.profile_id, profile]),
    );
    const accountByProfileId = new Map(
      visibleAccounts.map((account) => [account.profile_id, account]),
    );
    const subscriptionIds = visibleAccounts.flatMap((account) =>
      account.addon_subscription_id ? [account.addon_subscription_id] : [],
    );
    const subscriptionsResult = subscriptionIds.length
      ? await supabase
          .from("addon_subscriptions")
          .select("id,current_period_ends_at,cancel_at_period_end")
          .in("id", subscriptionIds)
      : { data: [], error: null };
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    const subscriptionsById = new Map(
      (subscriptionsResult.data ?? []).map((subscription) => [subscription.id, subscription]),
    );

    const propertyManagers = profileIds
      .flatMap((profileId) => {
        const profile = profilesById.get(profileId);
        const pmProfile = pmProfilesById.get(profileId);
        const account = accountByProfileId.get(profileId);
        if (!profile || !pmProfile || !account) return [];
        const subscription = account.addon_subscription_id
          ? subscriptionsById.get(account.addon_subscription_id) ?? null
          : null;
        return [{
          profileId,
          propertyManagerId: pmProfile.id,
          name:
            [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
            profile.email,
          email: profile.email,
          city: pmProfile.primary_city,
          status: account.status,
          accountManagerMemberId: account.account_manager_member_id,
          subscriptionEndsAt:
            subscription?.current_period_ends_at ?? account.prime_expires_at,
          graceEndsAt: account.grace_ends_at,
          cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
        }];
      })
      .sort((left, right) => left.name.localeCompare(right.name, "it"));

    const requestedProfileId = request.nextUrl.searchParams.get("profileId");
    const parsedProfileId = requestedProfileId
      ? z.string().uuid().parse(requestedProfileId)
      : propertyManagers[0]?.profileId;
    const selected = propertyManagers.find((row) => row.profileId === parsedProfileId);
    if (!selected) {
      throw new AdminApiError(403, "Property Manager PRIME non disponibile nel tuo portafoglio.");
    }

    const leads = await getPrimeZoneLeadsForProfile(selected.profileId);
    const nextLeadExpiryAt = leads.reduce<string | null>((nearest, lead) => {
      if (!nearest || lead.primeAccessUntil < nearest) return lead.primeAccessUntil;
      return nearest;
    }, null);

    return NextResponse.json(
      {
        propertyManagers,
        selected: { ...selected, nextLeadExpiryAt },
        leads,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
