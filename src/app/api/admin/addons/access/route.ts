import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getMarketingAddonId } from "@/lib/addons/admin";
import type {
  AddonManualAccess,
  AddonPropertyManagerOption,
  AddonSubscriptionStatus,
} from "@/lib/addons/types";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";

const currentStatuses: AddonSubscriptionStatus[] = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "paused",
  "unpaid",
];

const grantSchema = z.object({
  profileId: z.string().uuid(),
  accessExpiresAt: z.string().datetime().nullable(),
  reason: z.string().trim().min(3).max(1000),
});

const revokeSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const addonProductId = await getMarketingAddonId(supabase);
    const search = sanitizeSearch(request.nextUrl.searchParams.get("search") ?? "");

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("addon_subscriptions")
      .select(
        "id,profile_id,status,source,access_expires_at,manual_reason,created_at,updated_at,canceled_at",
      )
      .eq("addon_product_id", addonProductId)
      .eq("source", "manual")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (subscriptionsError) throw subscriptionsError;

    const accessProfileIds = Array.from(
      new Set((subscriptions ?? []).map((item) => item.profile_id)),
    );
    const { data: accessProfiles, error: accessProfilesError } = accessProfileIds.length
      ? await supabase
          .from("profiles")
          .select("id,email,first_name,last_name,status")
          .in("id", accessProfileIds)
      : { data: [], error: null };

    if (accessProfilesError) throw accessProfilesError;

    const profilesById = new Map(
      (accessProfiles ?? []).map((profile) => [profile.id, profile]),
    );
    const accesses: AddonManualAccess[] = (subscriptions ?? []).map((subscription) => {
      const profile = profilesById.get(subscription.profile_id);
      const isExpired = Boolean(
        subscription.status === "active" &&
          subscription.access_expires_at &&
          new Date(subscription.access_expires_at).getTime() <= Date.now(),
      );

      return {
        id: subscription.id,
        profileId: subscription.profile_id,
        email: profile?.email ?? "Utente non disponibile",
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        status: subscription.status,
        effectiveStatus: isExpired ? "expired" : subscription.status,
        accessExpiresAt: subscription.access_expires_at,
        manualReason: subscription.manual_reason ?? "",
        grantedAt: subscription.created_at,
        updatedAt: subscription.updated_at,
        canceledAt: subscription.canceled_at,
      };
    });

    const candidates = search.length >= 2
      ? await searchPropertyManagers({ supabase, addonProductId, search })
      : [];

    return NextResponse.json(
      { accesses, candidates },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = grantSchema.parse(await request.json());
    const addonProductId = await getMarketingAddonId(supabase);
    const expiresAt = payload.accessExpiresAt
      ? new Date(payload.accessExpiresAt)
      : null;

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new AdminApiError(422, "La scadenza deve essere futura.");
    }

    const [{ data: targetProfile, error: targetError }, { data: role, error: roleError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,email,first_name,last_name,status")
          .eq("id", payload.profileId)
          .single(),
        supabase
          .from("user_roles")
          .select("id")
          .eq("profile_id", payload.profileId)
          .eq("role", "property_manager")
          .maybeSingle(),
      ]);

    if (targetError || !targetProfile || roleError || !role) {
      throw new AdminApiError(404, "Property Manager non trovato.");
    }
    if (targetProfile.status !== "active") {
      throw new AdminApiError(409, "Non puoi assegnare l'Addon a un account sospeso.");
    }

    const { data: currentAccess, error: currentError } = await supabase
      .from("addon_subscriptions")
      .select("*")
      .eq("addon_product_id", addonProductId)
      .eq("profile_id", payload.profileId)
      .in("status", currentStatuses)
      .maybeSingle();

    if (currentError) throw currentError;
    if (currentAccess?.source === "stripe") {
      throw new AdminApiError(
        409,
        "Il Property Manager ha già un abbonamento Stripe corrente.",
      );
    }

    const now = new Date().toISOString();
    const accessExpiresAt = expiresAt?.toISOString() ?? null;
    let subscriptionId: string;
    let action: "addon.manual_access_granted" | "addon.manual_access_updated";

    if (currentAccess) {
      const { data: updated, error: updateError } = await supabase
        .from("addon_subscriptions")
        .update({
          status: "active",
          access_expires_at: accessExpiresAt,
          canceled_at: null,
          cancel_at_period_end: false,
          manual_reason: payload.reason,
          granted_by: profile.id,
        })
        .eq("id", currentAccess.id)
        .eq("source", "manual")
        .select("id")
        .single();

      if (updateError || !updated) throw updateError ?? new Error("Accesso non aggiornato.");
      subscriptionId = updated.id;
      action = "addon.manual_access_updated";
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("addon_subscriptions")
        .insert({
          addon_product_id: addonProductId,
          profile_id: payload.profileId,
          status: "active",
          source: "manual",
          current_period_started_at: now,
          access_expires_at: accessExpiresAt,
          manual_reason: payload.reason,
          granted_by: profile.id,
          metadata: { granted_from: "admin_addons" },
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        if (/addon_subscriptions_one_current_per_profile_idx|duplicate key/i.test(insertError?.message ?? "")) {
          throw new AdminApiError(409, "Esiste già un accesso corrente per questo utente.");
        }
        throw insertError ?? new Error("Accesso non creato.");
      }
      subscriptionId = inserted.id;
      action = "addon.manual_access_granted";
    }

    const { error: eventError } = await supabase.from("addon_access_events").insert({
      addon_product_id: addonProductId,
      subscription_id: subscriptionId,
      profile_id: payload.profileId,
      actor_profile_id: profile.id,
      action: action === "addon.manual_access_granted" ? "manual_granted" : "manual_updated",
      reason: payload.reason,
      metadata: { access_expires_at: accessExpiresAt },
    });
    if (eventError) console.error("Addon access event failed:", eventError.message);

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "addon_subscription",
      entityId: subscriptionId,
      action,
      before: currentAccess,
      after: {
        profileId: payload.profileId,
        email: targetProfile.email,
        source: "manual",
        status: "active",
        accessExpiresAt,
        reason: payload.reason,
      },
    });

    return NextResponse.json({ ok: true, subscriptionId });
  } catch (error) {
    return addonAccessErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);
    const payload = revokeSchema.parse(await request.json());
    const addonProductId = await getMarketingAddonId(supabase);
    const { data: currentAccess, error: currentError } = await supabase
      .from("addon_subscriptions")
      .select("*")
      .eq("id", payload.subscriptionId)
      .eq("addon_product_id", addonProductId)
      .eq("source", "manual")
      .single();

    if (currentError || !currentAccess) {
      throw new AdminApiError(404, "Accesso manuale non trovato.");
    }
    if (["canceled", "expired"].includes(currentAccess.status)) {
      throw new AdminApiError(409, "Questo accesso non è più attivo.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("addon_subscriptions")
      .update({
        status: "canceled",
        canceled_at: now,
        access_expires_at: now,
        cancel_at_period_end: false,
        manual_reason: payload.reason,
      })
      .eq("id", currentAccess.id)
      .eq("source", "manual");

    if (updateError) throw updateError;

    const { error: eventError } = await supabase.from("addon_access_events").insert({
      addon_product_id: addonProductId,
      subscription_id: currentAccess.id,
      profile_id: currentAccess.profile_id,
      actor_profile_id: profile.id,
      action: "manual_revoked",
      reason: payload.reason,
    });
    if (eventError) console.error("Addon access event failed:", eventError.message);

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "addon_subscription",
      entityId: currentAccess.id,
      action: "addon.manual_access_revoked",
      before: currentAccess,
      after: {
        status: "canceled",
        canceledAt: now,
        reason: payload.reason,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return addonAccessErrorResponse(error);
  }
}

async function searchPropertyManagers({
  supabase,
  addonProductId,
  search,
}: {
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"];
  addonProductId: string;
  search: string;
}) {
  const { data: matchingProfiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,email,first_name,last_name,status")
    .or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (profilesError) throw profilesError;
  const matchingIds = (matchingProfiles ?? []).map((profile) => profile.id);
  if (!matchingIds.length) return [];

  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("profile_id")
    .eq("role", "property_manager")
    .in("profile_id", matchingIds);

  if (rolesError) throw rolesError;
  const propertyManagerIds = new Set((roleRows ?? []).map((row) => row.profile_id));
  const propertyManagers = (matchingProfiles ?? [])
    .filter((candidate) => propertyManagerIds.has(candidate.id))
    .slice(0, 20);
  const candidateIds = propertyManagers.map((candidate) => candidate.id);

  const { data: currentAccesses, error: accessError } = candidateIds.length
    ? await supabase
        .from("addon_subscriptions")
        .select("id,profile_id,source,status,access_expires_at")
        .eq("addon_product_id", addonProductId)
        .in("profile_id", candidateIds)
        .in("status", currentStatuses)
    : { data: [], error: null };

  if (accessError) throw accessError;
  const accessByProfileId = new Map(
    (currentAccesses ?? []).map((access) => [access.profile_id, access]),
  );

  return propertyManagers.map<AddonPropertyManagerOption>((candidate) => {
    const access = accessByProfileId.get(candidate.id);
    return {
      profileId: candidate.id,
      email: candidate.email,
      firstName: candidate.first_name ?? "",
      lastName: candidate.last_name ?? "",
      profileStatus: candidate.status,
      currentAccess: access
        ? {
            id: access.id,
            source: access.source,
            status: access.status,
            accessExpiresAt: access.access_expires_at,
          }
        : null,
    };
  });
}

function sanitizeSearch(value: string) {
  return value.trim().replace(/[,%_()\"]/g, " ").replace(/\s+/g, " ").slice(0, 100);
}

function addonAccessErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Dati accesso non validi." },
      { status: 422 },
    );
  }
  return adminApiErrorResponse(error);
}
