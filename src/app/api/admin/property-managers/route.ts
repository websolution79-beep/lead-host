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
  id: string;
  lead_id: string;
  property_manager_id: string;
  amount_cents: number;
  mode: "shared" | "exclusive";
  status: string;
  created_at: string;
};

type WalletTransactionRow = {
  id: string;
  profile_id: string;
  type: "top_up" | "lead_purchase" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "cancelled";
  amount_cents: number;
  balance_after_cents: number | null;
  description: string | null;
  provider: string | null;
  provider_reference: string | null;
  lead_purchase_id: string | null;
  created_at: string;
  completed_at: string | null;
};

type PaymentReferenceRow = {
  id: string;
  provider_payment_id: string | null;
  provider_checkout_session_id: string | null;
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
    const requestedProfileId = request.nextUrl.searchParams.get("profileId");

    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("profile_id")
      .eq("role", "property_manager");

    if (rolesError) throw rolesError;

    const allProfileIds = Array.from(
      new Set((roleRows ?? []).map((item) => item.profile_id).filter(Boolean)),
    );

    if (requestedProfileId && !allProfileIds.includes(requestedProfileId)) {
      return NextResponse.json(
        { error: "Property Manager non trovato." },
        { status: 404 },
      );
    }

    const profileIds = requestedProfileId
      ? [requestedProfileId]
      : allProfileIds;

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
      requestedProfileId
        ? supabase.from("billing_profiles").select("*").in("profile_id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      requestedProfileId
        ? supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
        : Promise.resolve({ data: { users: [] }, error: null }),
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

    if (!requestedProfileId) {
      const propertyManagers = ((profiles ?? []) as ProfileRow[])
        .map((profile) => {
          const pmProfile = pmProfilesByProfileId.get(profile.id);
          const wallet = walletsByProfileId.get(profile.id);
          const managedPropertiesRange =
            pmProfile?.managed_properties_range ?? null;

          return {
            profileId: profile.id,
            email: profile.email,
            firstName: profile.first_name,
            lastName: profile.last_name,
            phone: profile.phone,
            avatarUrl: profile.avatar_url,
            profileStatus: profile.status,
            verificationStatus:
              pmProfile?.verification_status ?? "not_verified",
            managedPropertiesRange,
            managedPropertiesLabel: getManagedPropertiesLabel(
              managedPropertiesRange,
              pmProfile?.managed_properties_count,
            ),
            primaryCity: pmProfile?.primary_city || "Non indicata",
            walletBalanceCents: wallet?.balance_cents ?? 0,
            walletCurrency: wallet?.currency ?? "eur",
            createdAt: profile.created_at,
          };
        })
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      return NextResponse.json(
        { propertyManagers },
        {
          headers: {
            "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
          },
        },
      );
    }
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
      { data: walletTransactions, error: walletTransactionsError },
    ] =
      await Promise.all([
        pmProfileIds.length
          ? supabase
              .from("lead_purchases")
              .select("id,lead_id,property_manager_id,amount_cents,mode,status,created_at")
              .in("property_manager_id", pmProfileIds)
          : Promise.resolve({ data: [], error: null }),
        pmProfileIds.length
          ? supabase.from("reports").select("property_manager_id,status").in(
              "property_manager_id",
              pmProfileIds,
            )
          : Promise.resolve({ data: [], error: null }),
        profileIds.length
          ? supabase
              .from("wallet_transactions")
              .select(
                "id,profile_id,type,status,amount_cents,balance_after_cents,description,provider,provider_reference,lead_purchase_id,created_at,completed_at",
              )
              .in("profile_id", profileIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (purchasesError) throw purchasesError;
    if (reportsError) throw reportsError;
    if (walletTransactionsError) throw walletTransactionsError;

    const purchasesByPmId = groupRowsByPropertyManagerId(
      (purchases ?? []) as LeadPurchaseRow[],
    );
    const reportsByPmId = groupRowsByPropertyManagerId((reports ?? []) as ReportRow[]);
    const walletTransactionsByProfileId = groupRowsByProfileId(
      (walletTransactions ?? []) as WalletTransactionRow[],
    );
    const leadIds = Array.from(
      new Set(((purchases ?? []) as LeadPurchaseRow[]).map((purchase) => purchase.lead_id)),
    );
    const paymentSessionIds = Array.from(
      new Set(
        ((walletTransactions ?? []) as WalletTransactionRow[])
          .map((transaction) => transaction.provider_reference)
          .filter((reference): reference is string => Boolean(reference)),
      ),
    );

    const paymentsTable = supabase.from("payments" as never) as unknown as {
      select: (columns: string) => {
        in: (
          column: string,
          values: string[],
        ) => Promise<{
          data: PaymentReferenceRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };

    const [leadTitlesResult, paymentReferencesResult] = await Promise.all([
      leadIds.length
        ? supabase.from("leads").select("id,title").in("id", leadIds)
        : Promise.resolve({ data: [], error: null }),
      paymentSessionIds.length
        ? paymentsTable
            .select("id,provider_payment_id,provider_checkout_session_id")
            .in("provider_checkout_session_id", paymentSessionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (leadTitlesResult.error) throw leadTitlesResult.error;
    if (paymentReferencesResult.error) throw paymentReferencesResult.error;

    const leadTitleById = new Map(
      (leadTitlesResult.data ?? []).map((lead) => [lead.id, lead.title]),
    );
    const paymentByCheckoutSessionId = new Map(
      ((paymentReferencesResult.data ?? []) as PaymentReferenceRow[]).map((payment) => [
        payment.provider_checkout_session_id,
        payment,
      ]),
    );

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
          walletTransactions: (walletTransactionsByProfileId.get(profile.id) ?? []).map(
            (transaction) => {
              const payment = transaction.provider_reference
                ? paymentByCheckoutSessionId.get(transaction.provider_reference)
                : undefined;

              return {
                id: transaction.id,
                type: transaction.type,
                status: transaction.status,
                amountCents: transaction.amount_cents,
                balanceAfterCents: transaction.balance_after_cents,
                description: transaction.description,
                provider: transaction.provider,
                providerReference: transaction.provider_reference,
                stripePaymentId: payment?.provider_payment_id ?? null,
                stripeCheckoutSessionId:
                  payment?.provider_checkout_session_id ?? transaction.provider_reference,
                leadPurchaseId: transaction.lead_purchase_id,
                createdAt: transaction.created_at,
                completedAt: transaction.completed_at,
              };
            },
          ),
          leadPurchases: (pmProfile ? purchasesByPmId.get(pmProfile.id) ?? [] : []).map(
            (purchase) => ({
              id: purchase.id,
              leadTitle: leadTitleById.get(purchase.lead_id) ?? "Lead acquistato",
              mode: purchase.mode,
              status: purchase.status,
              amountCents: purchase.amount_cents,
              createdAt: purchase.created_at,
            }),
          ),
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

function groupRowsByProfileId<T extends { profile_id: string }>(rows: T[]) {
  return rows.reduce((map, row) => {
    const currentRows = map.get(row.profile_id) ?? [];
    currentRows.push(row);
    map.set(row.profile_id, currentRows);
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
