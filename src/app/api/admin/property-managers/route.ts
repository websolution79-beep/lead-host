import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import { getManagedPropertiesLabel } from "@/lib/domain/pm-onboarding";

const updatePropertyManagerSchema = z.object({
  profileId: z.string().uuid(),
  profileStatus: z.enum(["active", "suspended"]).optional(),
  verificationStatus: z.enum(["not_verified", "verified", "suspended"]).optional(),
});

type ProfileRow = {
  id: string;
  auth_user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: "active" | "suspended";
  created_at: string;
};

type PropertyManagerProfileRow = {
  id: string;
  profile_id: string;
  company_name: string | null;
  managed_properties_count: number | null;
  managed_properties_range?: string | null;
  primary_city?: string | null;
  verification_status: "not_verified" | "verified" | "suspended";
  created_at: string;
};

type WalletRow = {
  profile_id: string;
  balance_cents: number;
  currency: string;
};

type AuthMetadata = {
  managed_properties_range?: string;
  primary_city?: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);

    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("profile_id")
      .eq("role", "property_manager");

    if (rolesError) throw rolesError;

    const profileIds = Array.from(
      new Set((roleRows ?? []).map((item) => item.profile_id).filter(Boolean)),
    );

    if (profileIds.length === 0) {
      return NextResponse.json({ propertyManagers: [] });
    }

    const [
      { data: profiles, error: profilesError },
      { data: pmProfiles, error: pmProfilesError },
      { data: wallets, error: walletsError },
      { data: authUsers },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,auth_user_id,email,first_name,last_name,phone,status,created_at")
        .in("id", profileIds),
      supabase.from("property_manager_profiles").select("*").in("profile_id", profileIds),
      supabase
        .from("wallets")
        .select("profile_id,balance_cents,currency")
        .in("profile_id", profileIds),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesError) throw profilesError;
    if (pmProfilesError) throw pmProfilesError;
    if (walletsError) throw walletsError;

    const pmProfilesByProfileId = new Map(
      ((pmProfiles ?? []) as PropertyManagerProfileRow[]).map((item) => [
        item.profile_id,
        item,
      ]),
    );
    const walletsByProfileId = new Map(
      ((wallets ?? []) as WalletRow[]).map((item) => [item.profile_id, item]),
    );
    const metadataByAuthUserId = new Map(
      (authUsers.users ?? []).map((user) => [
        user.id,
        (user.user_metadata ?? {}) as AuthMetadata,
      ]),
    );

    const propertyManagers = ((profiles ?? []) as ProfileRow[])
      .map((profile) => {
        const pmProfile = pmProfilesByProfileId.get(profile.id);
        const wallet = walletsByProfileId.get(profile.id);
        const metadata = profile.auth_user_id
          ? metadataByAuthUserId.get(profile.auth_user_id)
          : undefined;
        const managedPropertiesRange =
          pmProfile?.managed_properties_range ?? metadata?.managed_properties_range ?? null;
        const primaryCity = pmProfile?.primary_city ?? metadata?.primary_city ?? null;

        return {
          id: pmProfile?.id ?? null,
          profileId: profile.id,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          phone: profile.phone,
          profileStatus: profile.status,
          verificationStatus: pmProfile?.verification_status ?? "not_verified",
          managedPropertiesRange,
          managedPropertiesLabel: getManagedPropertiesLabel(
            managedPropertiesRange,
            pmProfile?.managed_properties_count,
          ),
          primaryCity: primaryCity || "Non indicata",
          walletBalanceCents: wallet?.balance_cents ?? 0,
          walletCurrency: wallet?.currency ?? "eur",
          createdAt: profile.created_at,
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return NextResponse.json({ propertyManagers });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const payload = updatePropertyManagerSchema.parse(await request.json());

    const { data: profile, error: profileFetchError } = await supabase
      .from("profiles")
      .select("id,email,first_name,last_name")
      .eq("id", payload.profileId)
      .single();

    if (profileFetchError) throw profileFetchError;

    if (payload.profileStatus) {
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ status: payload.profileStatus })
        .eq("id", payload.profileId);

      if (profileUpdateError) throw profileUpdateError;
    }

    if (payload.verificationStatus) {
      const fallbackCompanyName =
        [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
        profile.email;

      const { error: pmUpdateError } = await supabase
        .from("property_manager_profiles")
        .upsert(
          {
            profile_id: payload.profileId,
            company_name: fallbackCompanyName,
            verification_status: payload.verificationStatus,
          },
          { onConflict: "profile_id" },
        );

      if (pmUpdateError) throw pmUpdateError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
