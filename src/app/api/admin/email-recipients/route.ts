import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminApiError,
  adminApiErrorResponse,
  requireSuperAdmin,
} from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  configurableRecipientTemplateIds,
  fetchTransactionalEmailRecipientConfigs,
  getConfiguredAdminEmails,
  saveTransactionalEmailRecipientConfigs,
} from "@/lib/config/transactional-email-recipients";

const configSchema = z.object({
  templateId: z.enum(configurableRecipientTemplateIds),
  includeDefaultAdmins: z.boolean(),
  roleIds: z.array(z.string().uuid()).max(50),
  memberIds: z.array(z.string().uuid()).max(100),
  additionalEmails: z.array(z.string().trim().email().max(255)).max(20),
});

const patchSchema = z.object({
  configs: z.array(configSchema).length(configurableRecipientTemplateIds.length),
});

export async function GET(request: NextRequest) {
  try {
    const { supabase, isSuperAdmin } = await requireSuperAdmin(request);
    const [configs, rolesResult, membersResult] = await Promise.all([
      fetchTransactionalEmailRecipientConfigs(supabase),
      supabase
        .from("team_roles")
        .select("id,name,is_active")
        .order("name"),
      supabase
        .from("team_members")
        .select("id,profile_id,role_id,status")
        .order("created_at", { ascending: false }),
    ]);

    if (rolesResult.error) throw rolesResult.error;
    if (membersResult.error) throw membersResult.error;

    const profileIds = Array.from(
      new Set((membersResult.data ?? []).map((member) => member.profile_id)),
    );
    const profilesResult = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id,email,first_name,last_name,status")
          .in("id", profileIds)
      : { data: [], error: null };

    if (profilesResult.error) throw profilesResult.error;

    const profilesById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const rolesById = new Map(
      (rolesResult.data ?? []).map((role) => [role.id, role]),
    );
    const members = (membersResult.data ?? []).map((member) => ({
      id: member.id,
      roleId: member.role_id,
      roleName: rolesById.get(member.role_id)?.name ?? "Ruolo non disponibile",
      status: member.status,
      profileStatus: profilesById.get(member.profile_id)?.status ?? "suspended",
      email: profilesById.get(member.profile_id)?.email ?? "",
      firstName: profilesById.get(member.profile_id)?.first_name ?? null,
      lastName: profilesById.get(member.profile_id)?.last_name ?? null,
    }));

    return NextResponse.json({
      configs,
      roles: rolesResult.data ?? [],
      members,
      configuredAdminEmails: getConfiguredAdminEmails(),
      canManageRecipients: isSuperAdmin,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } = await requireSuperAdmin(request);

    if (!isSuperAdmin) {
      throw new AdminApiError(
        403,
        "Solo il Super Admin puo modificare i destinatari delle email.",
      );
    }

    const payload = patchSchema.safeParse(await request.json().catch(() => null));

    if (!payload.success) {
      return NextResponse.json(
        { error: "Configurazione destinatari non valida." },
        { status: 422 },
      );
    }

    const uniqueTemplateIds = new Set(
      payload.data.configs.map((config) => config.templateId),
    );

    if (uniqueTemplateIds.size !== configurableRecipientTemplateIds.length) {
      return NextResponse.json(
        { error: "Ogni template deve avere una sola configurazione destinatari." },
        { status: 422 },
      );
    }

    const missingAdminRecipients = payload.data.configs.find(
      (config) =>
        config.templateId.startsWith("admin.") &&
        !config.includeDefaultAdmins &&
        !config.roleIds.length &&
        !config.memberIds.length &&
        !config.additionalEmails.length,
    );

    if (missingAdminRecipients) {
      return NextResponse.json(
        {
          error:
            "Le notifiche amministrative devono avere almeno un destinatario.",
        },
        { status: 422 },
      );
    }

    const previousConfigs = await fetchTransactionalEmailRecipientConfigs(supabase);
    const configs = await saveTransactionalEmailRecipientConfigs({
      supabase,
      profileId: profile.id,
      configs: payload.data.configs.map((config) => ({
        ...config,
        roleIds: Array.from(new Set(config.roleIds)),
        memberIds: Array.from(new Set(config.memberIds)),
        additionalEmails: Array.from(
          new Set(config.additionalEmails.map((email) => email.toLowerCase())),
        ),
      })),
    });

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "settings",
      entityId: "email.internal_recipients",
      action: "email.recipients_updated",
      before: { configs: previousConfigs },
      after: { configs },
    });

    return NextResponse.json({ ok: true, configs });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
