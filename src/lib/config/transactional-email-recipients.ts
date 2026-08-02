import type { SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { TransactionalEmailTemplateId } from "@/lib/config/transactional-email-settings";

type ServiceClient = SupabaseClient<Database>;

export const configurableRecipientTemplateIds = [
  "admin.owner_request_pending",
  "lead.purchased",
  "wallet.top_up",
  "admin.support_request_pending",
  "admin.support_request_reply",
  "admin.addon_marketing_activated",
] as const satisfies readonly TransactionalEmailTemplateId[];

export type ConfigurableRecipientTemplateId =
  (typeof configurableRecipientTemplateIds)[number];

export type TransactionalEmailRecipientConfig = {
  templateId: ConfigurableRecipientTemplateId;
  includeDefaultAdmins: boolean;
  roleIds: string[];
  memberIds: string[];
  additionalEmails: string[];
};

const SETTINGS_KEY = "email.internal_recipients";

const defaultConfigs: TransactionalEmailRecipientConfig[] =
  configurableRecipientTemplateIds.map((templateId) => ({
    templateId,
    includeDefaultAdmins: templateId.startsWith("admin."),
    roleIds: [],
    memberIds: [],
    additionalEmails: [],
  }));

export function isConfigurableRecipientTemplate(
  templateId: TransactionalEmailTemplateId,
): templateId is ConfigurableRecipientTemplateId {
  return configurableRecipientTemplateIds.includes(
    templateId as ConfigurableRecipientTemplateId,
  );
}

export async function fetchTransactionalEmailRecipientConfigs(
  supabase: ServiceClient,
) {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) throw error;

  return mergeConfigs(data?.value);
}

export async function saveTransactionalEmailRecipientConfigs({
  supabase,
  profileId,
  configs,
}: {
  supabase: ServiceClient;
  profileId: string;
  configs: TransactionalEmailRecipientConfig[];
}) {
  const normalized = mergeConfigs(configs as unknown as Json);
  const { error } = await supabase.from("settings").upsert(
    {
      key: SETTINGS_KEY,
      value: normalized as unknown as Json,
      updated_by: profileId,
    },
    { onConflict: "key" },
  );

  if (error) throw error;

  return normalized;
}

export async function resolveTransactionalEmailInternalRecipients(
  supabase: ServiceClient,
  templateId: TransactionalEmailTemplateId,
) {
  if (!isConfigurableRecipientTemplate(templateId)) return [];

  let configs: TransactionalEmailRecipientConfig[];

  try {
    configs = await fetchTransactionalEmailRecipientConfigs(supabase);
  } catch (error) {
    console.warn("Email recipient settings not loaded; using defaults:", error);
    configs = defaultConfigs;
  }
  const config = configs.find((item) => item.templateId === templateId);

  if (!config) return [];

  const recipients = new Set<string>();

  if (config.includeDefaultAdmins) {
    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("profile_id")
      .eq("role", "super_admin");

    if (!rolesError && roleRows?.length) {
      const profileIds = Array.from(new Set(roleRows.map((item) => item.profile_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", profileIds)
        .eq("status", "active");

      (profiles ?? []).forEach((profile) => addEmail(recipients, profile.email));
    }

    getConfiguredAdminEmails().forEach((email) => addEmail(recipients, email));
  }

  if (config.roleIds.length || config.memberIds.length) {
    const { data: activeRoles } = config.roleIds.length
      ? await supabase
          .from("team_roles")
          .select("id")
          .in("id", config.roleIds)
          .eq("is_active", true)
      : { data: [] };
    const activeRoleIds = new Set((activeRoles ?? []).map((role) => role.id));
    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("id,profile_id,role_id,status")
      .eq("status", "active");

    if (!membersError && members?.length) {
      const selectedMembers = members.filter(
        (member) =>
          config.memberIds.includes(member.id) || activeRoleIds.has(member.role_id),
      );
      const profileIds = Array.from(
        new Set(selectedMembers.map((member) => member.profile_id)),
      );

      if (profileIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("email")
          .in("id", profileIds)
          .eq("status", "active");

        (profiles ?? []).forEach((profile) => addEmail(recipients, profile.email));
      }
    }
  }

  config.additionalEmails.forEach((email) => addEmail(recipients, email));

  return Array.from(recipients);
}

export function getConfiguredAdminEmails() {
  return (getEnv("TRANSACTIONAL_ADMIN_EMAILS") ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

function mergeConfigs(value: Json | undefined) {
  const saved = Array.isArray(value)
    ? value
        .map(parseConfig)
        .filter((item): item is TransactionalEmailRecipientConfig => Boolean(item))
    : [];
  const savedById = new Map(saved.map((item) => [item.templateId, item]));

  return defaultConfigs.map((defaultConfig) => ({
    ...defaultConfig,
    ...savedById.get(defaultConfig.templateId),
    templateId: defaultConfig.templateId,
  }));
}

function parseConfig(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, Json>;
  const templateId = String(record.templateId ?? "");

  if (
    !configurableRecipientTemplateIds.includes(
      templateId as ConfigurableRecipientTemplateId,
    )
  ) {
    return null;
  }

  return {
    templateId: templateId as ConfigurableRecipientTemplateId,
    includeDefaultAdmins: Boolean(record.includeDefaultAdmins),
    roleIds: parseStringArray(record.roleIds),
    memberIds: parseStringArray(record.memberIds),
    additionalEmails: parseStringArray(record.additionalEmails)
      .map(normalizeEmail)
      .filter(Boolean),
  } satisfies TransactionalEmailRecipientConfig;
}

function parseStringArray(value: Json | undefined) {
  return Array.isArray(value)
    ? Array.from(
        new Set(value.filter((item): item is string => typeof item === "string")),
      )
    : [];
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function addEmail(recipients: Set<string>, value: string) {
  const email = normalizeEmail(value);

  if (email) recipients.add(email);
}
