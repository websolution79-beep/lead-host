import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import { getManagedPropertiesLabel } from "@/lib/domain/pm-onboarding";
import { sendPropertyManagerVerifiedEmail } from "@/lib/email/notifications";

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
  avatar_url: string | null;
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
};

type PropertyManagerProfileRow = {
  id: string;
  profile_id: string;
  company_name: string | null;
  vat_number: string | null;
  website: string | null;
  managed_properties_count: number | null;
  managed_properties_range?: string | null;
  primary_city?: string | null;
  years_experience: number | null;
  business_description: string | null;
  operating_model: string | null;
  verification_status: "not_verified" | "verified" | "suspended";
  created_at: string;
  updated_at: string;
};

type WalletRow = {
  profile_id: string;
  balance_cents: number;
  currency: string;
};

type BillingProfileRow = {
  profile_id: string;
  subject_type: "individual" | "company";
  first_name: string | null;
  last_name: string | null;
  fiscal_code: string | null;
  company_name: string | null;
  vat_number: string | null;
  company_fiscal_code: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  province: string | null;
  country: string;
  sdi_code: string | null;
  pec: string | null;
  invoice_email: string | null;
  updated_at: string;
};

type LeadPurchaseRow = {
  property_manager_id: string;
  amount_cents: number;
  mode: "shared" | "exclusive";
  status: string;
};

type ReportRow = {
  property_manager_id: string;
  status: string;
};

type AuthMetadata = {
  first_name?: string;
  last_name?: string;
  phone?: string;
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
      { data: billingProfiles, error: billingProfilesError },
      { data: authUsers },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id,auth_user_id,email,first_name,last_name,phone,avatar_url,status,created_at,updated_at",
        )
        .in("id", profileIds),
      supabase.from("property_manager_profiles").select("*").in("profile_id", profileIds),
      supabase
        .from("wallets")
        .select("profile_id,balance_cents,currency")
        .in("profile_id", profileIds),
      supabase.from("billing_profiles").select("*").in("profile_id", profileIds),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesError) throw profilesError;
    if (pmProfilesError) throw pmProfilesError;
    if (walletsError) throw walletsError;
    if (billingProfilesError && !isMissingRelationError(billingProfilesError)) {
      throw billingProfilesError;
    }

    const pmProfilesByProfileId = new Map(
      ((pmProfiles ?? []) as PropertyManagerProfileRow[]).map((item) => [
        item.profile_id,
        item,
      ]),
    );
    const walletsByProfileId = new Map(
      ((wallets ?? []) as WalletRow[]).map((item) => [item.profile_id, item]),
    );
    const billingByProfileId = new Map(
      ((billingProfilesError ? [] : billingProfiles ?? []) as BillingProfileRow[]).map(
        (item) => [item.profile_id, item],
      ),
    );
    const metadataByAuthUserId = new Map(
      (authUsers.users ?? []).map((user) => [
        user.id,
        (user.user_metadata ?? {}) as AuthMetadata,
      ]),
    );
    const authUserById = new Map((authUsers.users ?? []).map((user) => [user.id, user]));
    const pmProfileIds = ((pmProfiles ?? []) as PropertyManagerProfileRow[])
      .map((item) => item.id)
      .filter(Boolean);

    const [
      { data: purchases, error: purchasesError },
      { data: reports, error: reportsError },
    ] =
      await Promise.all([
        pmProfileIds.length
          ? supabase
              .from("lead_purchases")
              .select("property_manager_id,amount_cents,mode,status")
              .in("property_manager_id", pmProfileIds)
          : Promise.resolve({ data: [], error: null }),
        pmProfileIds.length
          ? supabase.from("reports").select("property_manager_id,status").in(
              "property_manager_id",
              pmProfileIds,
            )
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (purchasesError) throw purchasesError;
    if (reportsError) throw reportsError;

    const purchasesByPmId = groupRowsByPropertyManagerId(
      (purchases ?? []) as LeadPurchaseRow[],
    );
    const reportsByPmId = groupRowsByPropertyManagerId((reports ?? []) as ReportRow[]);

    const propertyManagers = ((profiles ?? []) as ProfileRow[])
      .map((profile) => {
        const pmProfile = pmProfilesByProfileId.get(profile.id);
        const wallet = walletsByProfileId.get(profile.id);
        const billingProfile = billingByProfileId.get(profile.id);
        const authUser = profile.auth_user_id ? authUserById.get(profile.auth_user_id) : null;
        const metadata = profile.auth_user_id
          ? metadataByAuthUserId.get(profile.auth_user_id)
          : undefined;
        const managedPropertiesRange =
          pmProfile?.managed_properties_range ?? metadata?.managed_properties_range ?? null;
        const primaryCity = pmProfile?.primary_city ?? metadata?.primary_city ?? null;
        const pmPurchases = pmProfile ? purchasesByPmId.get(pmProfile.id) ?? [] : [];
        const completedPurchases = pmPurchases.filter((purchase) =>
          ["paid", "contact_unlocked"].includes(purchase.status),
        );
        const pmReports = pmProfile ? reportsByPmId.get(pmProfile.id) ?? [] : [];
        const openReports = pmReports.filter((report) =>
          ["pending", "reviewing"].includes(report.status),
        );

        return {
          id: pmProfile?.id ?? null,
          profileId: profile.id,
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          phone: profile.phone,
          avatarUrl: profile.avatar_url,
          profileStatus: profile.status,
          verificationStatus: pmProfile?.verification_status ?? "not_verified",
          managedPropertiesRange,
          managedPropertiesLabel: getManagedPropertiesLabel(
            managedPropertiesRange,
            pmProfile?.managed_properties_count,
          ),
          primaryCity: primaryCity || "Non indicata",
          companyName: pmProfile?.company_name ?? null,
          vatNumber: pmProfile?.vat_number ?? null,
          website: pmProfile?.website ?? null,
          managedPropertiesCount: pmProfile?.managed_properties_count ?? null,
          yearsExperience: pmProfile?.years_experience ?? null,
          businessDescription: pmProfile?.business_description ?? null,
          operatingModel: pmProfile?.operating_model ?? null,
          walletBalanceCents: wallet?.balance_cents ?? 0,
          walletCurrency: wallet?.currency ?? "eur",
          emailConfirmedAt: authUser?.email_confirmed_at ?? null,
          lastSignInAt: authUser?.last_sign_in_at ?? null,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
          propertyManagerCreatedAt: pmProfile?.created_at ?? null,
          propertyManagerUpdatedAt: pmProfile?.updated_at ?? null,
          signupData: {
            firstName: metadata?.first_name ?? profile.first_name,
            lastName: metadata?.last_name ?? profile.last_name,
            email: profile.email,
            phone: metadata?.phone ?? profile.phone,
            managedPropertiesRange,
            managedPropertiesLabel: getManagedPropertiesLabel(
              managedPropertiesRange,
              pmProfile?.managed_properties_count,
            ),
            primaryCity: primaryCity || null,
            passwordStatus: "Protetta da Supabase Auth, non visualizzabile.",
          },
          billingProfile: billingProfile
            ? {
                subjectType: billingProfile.subject_type,
                firstName: billingProfile.first_name,
                lastName: billingProfile.last_name,
                fiscalCode: billingProfile.fiscal_code,
                companyName: billingProfile.company_name,
                vatNumber: billingProfile.vat_number,
                companyFiscalCode: billingProfile.company_fiscal_code,
                addressLine: billingProfile.address_line,
                postalCode: billingProfile.postal_code,
                city: billingProfile.city,
                province: billingProfile.province,
                country: billingProfile.country,
                sdiCode: billingProfile.sdi_code,
                pec: billingProfile.pec,
                invoiceEmail: billingProfile.invoice_email,
                updatedAt: billingProfile.updated_at,
              }
            : null,
          stats: {
            purchasesCount: completedPurchases.length,
            exclusivePurchasesCount: completedPurchases.filter(
              (purchase) => purchase.mode === "exclusive",
            ).length,
            sharedPurchasesCount: completedPurchases.filter(
              (purchase) => purchase.mode === "shared",
            ).length,
            totalSpentCents: completedPurchases.reduce(
              (total, purchase) => total + purchase.amount_cents,
              0,
            ),
            reportsCount: pmReports.length,
            openReportsCount: openReports.length,
          },
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    return NextResponse.json({ propertyManagers });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function groupRowsByPropertyManagerId<T extends { property_manager_id: string }>(rows: T[]) {
  return rows.reduce((map, row) => {
    const currentRows = map.get(row.property_manager_id) ?? [];
    currentRows.push(row);
    map.set(row.property_manager_id, currentRows);

    return map;
  }, new Map<string, T[]>());
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST205" ||
    error.message?.toLowerCase().includes("could not find the table")
  );
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

      const { data: pmProfile, error: pmUpdateError } = await supabase
        .from("property_manager_profiles")
        .upsert(
          {
            profile_id: payload.profileId,
            company_name: fallbackCompanyName,
            verification_status: payload.verificationStatus,
          },
          { onConflict: "profile_id" },
        )
        .select("id")
        .single();

      if (pmUpdateError) throw pmUpdateError;

      if (payload.verificationStatus === "verified") {
        await sendPropertyManagerVerifiedEmail(
          {
            id: profile.id,
            email: profile.email,
            first_name: profile.first_name,
            last_name: profile.last_name,
            status: payload.profileStatus ?? "active",
          },
          pmProfile?.id,
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
