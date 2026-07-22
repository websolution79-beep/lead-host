import { NextResponse, type NextRequest } from "next/server";
import {
  propertyManagerApiErrorResponse,
  requirePropertyManager,
} from "@/lib/api/property-manager-auth";
import { sendWelcomeEmail } from "@/lib/email/notifications";

export async function POST(request: NextRequest) {
  try {
    const { profile } = await requirePropertyManager(request);

    await sendWelcomeEmail({
      id: profile.id,
      email: profile.email,
      first_name: profile.first_name,
      last_name: profile.last_name,
      status: profile.status,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return propertyManagerApiErrorResponse(error);
  }
}
