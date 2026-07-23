import { cookies } from "next/headers";
import { cache } from "react";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/session-cookies";
import { verifyAccessToken } from "@/lib/auth/verify-access-token";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/roles";

export const getServerSessionUser = cache(async function getServerSessionUser() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  return verifyAccessToken(accessToken);
});

export const getServerSessionProfile = cache(async function getServerSessionProfile() {
  const user = await getServerSessionUser();

  if (!user) {
    return null;
  }

  const supabase = createServiceSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (profileError || !profile || profile.status !== "active") {
    return null;
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", profile.id);

  if (rolesError) {
    return null;
  }

  const roles = ((roleRows ?? []) as { role: AppRole }[]).map((item) => item.role);

  return { user, profile, roles };
});
