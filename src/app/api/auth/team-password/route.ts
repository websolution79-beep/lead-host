import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const passwordSchema = z.object({
  password: z.string().min(12).max(128),
});

export async function PATCH(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ error: "Sessione non trovata." }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sessione non valida." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,status,user_roles(role)")
    .eq("auth_user_id", authData.user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Profilo non trovato." }, { status: 404 });
  }

  const roles = (
    (profile as unknown as { user_roles: Array<{ role: string }> }).user_roles ?? []
  ).map((item) => item.role);

  if (!roles.includes("team_member") || roles.includes("super_admin")) {
    return NextResponse.json({ handled: false });
  }

  const payload = passwordSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "La nuova password deve contenere almeno 12 caratteri." },
      { status: 422 },
    );
  }

  const { data: member, error: memberError } = await supabase
    .from("team_members")
    .select("id,status,must_change_password")
    .eq("profile_id", profile.id)
    .single();

  if (memberError || !member || member.status !== "active") {
    return NextResponse.json(
      { error: "Account Team non attivo." },
      { status: 403 },
    );
  }

  const { error: passwordError } = await supabase.auth.admin.updateUserById(
    authData.user.id,
    { password: payload.data.password },
  );

  if (passwordError) {
    return NextResponse.json(
      { error: "Non è stato possibile aggiornare la password." },
      { status: 500 },
    );
  }

  const { error: memberUpdateError } = await supabase
    .from("team_members")
    .update({ must_change_password: false })
    .eq("id", member.id)
    .eq("status", "active");

  if (memberUpdateError) {
    return NextResponse.json(
      { error: "Password aggiornata, ma accesso Team non completato." },
      { status: 500 },
    );
  }

  await writeAdminAuditLog({
    supabase,
    request,
    actorProfileId: profile.id,
    isSuperAdmin: false,
    entityType: "team_member",
    entityId: member.id,
    action: "team.password_changed",
    before: { must_change_password: member.must_change_password },
    after: { must_change_password: false },
  });

  return NextResponse.json({ handled: true });
}
