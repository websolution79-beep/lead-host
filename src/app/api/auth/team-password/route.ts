import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedProfileContext } from "@/lib/auth/profile-context";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "Sessione non trovata." }, { status: 401 });
  }

  const context = await getAuthenticatedProfileContext(token);

  if (!context || !context.roles.includes("team_member")) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("team_members")
    .update({ must_change_password: false })
    .eq("profile_id", context.profile.id);

  if (error) {
    return NextResponse.json(
      { error: "Non è stato possibile completare l'aggiornamento." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
