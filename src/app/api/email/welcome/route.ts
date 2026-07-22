import { NextResponse, type NextRequest } from "next/server";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { sendWelcomeEmail } from "@/lib/email/notifications";

export async function POST(request: NextRequest) {
  try {
    const { supabase, profile } = await requirePropertyManager(request);
    const logs = supabase.from("email_delivery_logs" as never) as unknown as {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            limit: (count: number) => Promise<{
              data: Array<{ id: string }> | null;
              error: { message?: string } | null;
            }>;
          };
        };
      };
    };
    const { data: alreadySent } = await logs
      .select("id")
      .eq("profile_id", profile.id)
      .eq("event_type", "pm.welcome")
      .limit(1);

    if (alreadySent?.length) {
      return NextResponse.json({ ok: true, status: "already_sent" });
    }

    const result = await sendWelcomeEmail({
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      status: profile.status,
    });

    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}
