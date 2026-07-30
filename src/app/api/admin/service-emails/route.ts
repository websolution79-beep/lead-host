import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { adminApiErrorResponse, requireSuperAdmin } from "@/lib/admin/auth";
import {
  processServiceEmailQueue,
  runServiceEmailWorkerSafely,
  sendServiceEmailTest,
  type ServiceEmailContent,
} from "@/lib/email/service-campaigns";

const contentSchema = z.object({
  subject: z.string().trim().min(1).max(180),
  preview: z.string().trim().max(220),
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(5000),
  extra: z.string().trim().max(2000),
  cta_label: z.string().trim().max(80),
  cta_url: z.string().trim().max(500),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("test"),
    content: contentSchema,
  }),
  z.object({
    action: z.literal("queue"),
    confirmServiceOnly: z.literal(true),
    content: contentSchema,
  }),
  z.object({
    action: z.literal("process"),
  }),
]);

type ServiceEmailCampaignRow = ServiceEmailContent & {
  id: string;
  recipient_scope: string;
  status: string;
  total_recipients: number;
  pending_count: number;
  sent_count: number;
  failed_count: number;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyManagerProfileRow = {
  profile_id: string;
};

type ActiveProfileRow = {
  id: string;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireSuperAdmin(request);
    const [campaignsResult, eligibleRecipients] = await Promise.all([
      (
        supabase.from("service_email_campaigns" as never) as unknown as {
          select: (columns: string) => {
            order: (
              column: string,
              options: { ascending: boolean },
            ) => {
              limit: (count: number) => Promise<{
                data: ServiceEmailCampaignRow[] | null;
                error: { code?: string; message?: string } | null;
              }>;
            };
          };
        }
      )
        .select(
          "id,subject,preview,title,body,extra,cta_label,cta_url,recipient_scope,status,total_recipients,pending_count,sent_count,failed_count,created_by,started_at,completed_at,created_at,updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(30),
      countEligibleRecipients(supabase),
    ]);
    const storageReady = !isMissingRelationError(campaignsResult.error);

    if (campaignsResult.error && storageReady) {
      throw campaignsResult.error;
    }

    return NextResponse.json({
      storageReady,
      eligibleRecipients,
      campaigns: storageReady ? campaignsResult.data ?? [] : [],
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile, isSuperAdmin } =
      await requireSuperAdmin(request);
    const payload = actionSchema.parse(await request.json());

    if (payload.action === "test") {
      const result = await sendServiceEmailTest({
        to: profile.email,
        profileId: profile.id,
        content: payload.content,
      });

      return NextResponse.json({ ok: true, result });
    }

    if (payload.action === "process") {
      const result = await processServiceEmailQueue(5, 100);

      return NextResponse.json({ ok: true, result });
    }

    const campaigns = supabase.from(
      "service_email_campaigns" as never,
    ) as unknown as {
      insert: (row: Record<string, unknown>) => {
        select: (columns: string) => {
          single: () => Promise<{
            data: { id: string } | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
      update: (row: Record<string, unknown>) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ error: { message?: string } | null }>;
      };
    };
    const campaignInsert = await campaigns
      .insert({
        ...payload.content,
        recipient_scope: "active_property_managers",
        status: "draft",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (campaignInsert.error || !campaignInsert.data) {
      if (isMissingRelationError(campaignInsert.error)) {
        return NextResponse.json(
          {
            error:
              "Database non aggiornato per le comunicazioni di servizio. Applica la migration dedicata.",
          },
          { status: 409 },
        );
      }

      throw campaignInsert.error ?? new Error("Campagna non creata.");
    }

    const rpc = supabase as unknown as {
      rpc: (
        fn: "queue_service_email_campaign",
        args: { p_campaign_id: string },
      ) => Promise<{ data: number | null; error: { message?: string } | null }>;
    };
    const queued = await rpc.rpc("queue_service_email_campaign", {
      p_campaign_id: campaignInsert.data.id,
    });

    if (queued.error) {
      await campaigns
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", campaignInsert.data.id);
      throw new Error(
        queued.error.message ?? "Destinatari della campagna non accodati.",
      );
    }

    await writeAdminAuditLog({
      supabase,
      request,
      actorProfileId: profile.id,
      isSuperAdmin,
      entityType: "service_email_campaign",
      entityId: campaignInsert.data.id,
      action: "service_email.queued",
      after: {
        subject: payload.content.subject,
        recipient_scope: "active_property_managers",
        recipient_count: queued.data ?? 0,
      },
    });

    if ((queued.data ?? 0) > 0) {
      after(() => runServiceEmailWorkerSafely(5, 100));
    }

    return NextResponse.json({
      ok: true,
      campaignId: campaignInsert.data.id,
      queuedRecipients: queued.data ?? 0,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function countEligibleRecipients(
  supabase: Awaited<ReturnType<typeof requireSuperAdmin>>["supabase"],
) {
  const propertyManagers = await (
    supabase.from("property_manager_profiles") as unknown as {
      select: (columns: string) => {
        neq: (
          column: string,
          value: string,
        ) => Promise<{
          data: PropertyManagerProfileRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    }
  )
    .select("profile_id")
    .neq("verification_status", "suspended");

  if (propertyManagers.error) throw propertyManagers.error;

  const profileIds = Array.from(
    new Set((propertyManagers.data ?? []).map((item) => item.profile_id)),
  );

  if (!profileIds.length) return 0;

  const profiles = await (
    supabase.from("profiles") as unknown as {
      select: (columns: string) => {
        in: (
          column: string,
          values: string[],
        ) => {
          eq: (
            statusColumn: string,
            status: string,
          ) => Promise<{
            data: ActiveProfileRow[] | null;
            error: { message?: string } | null;
          }>;
        };
      };
    }
  )
    .select("id")
    .in("id", profileIds)
    .eq("status", "active");

  if (profiles.error) throw profiles.error;

  return profiles.data?.length ?? 0;
}

function isMissingRelationError(
  error: { code?: string; message?: string } | null,
) {
  return Boolean(
    error &&
      (error.code === "PGRST205" ||
        error.code === "42P01" ||
        error.message?.toLowerCase().includes("could not find the table") ||
        error.message?.toLowerCase().includes("does not exist")),
  );
}
