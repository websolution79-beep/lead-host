"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import type { AdminPermissionMap } from "@/lib/admin/permissions";
import type { AppRole } from "@/lib/auth/roles";

export type AppSession = {
  userId: string;
  profileId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  roles: AppRole[];
  isSuperAdmin?: boolean;
  adminPermissions?: AdminPermissionMap;
  marketingAddon?: {
    menuVisible: boolean;
    hasAccess: boolean;
  };
  primeAccess?: {
    hasAccess: boolean;
    expiresAt: string | null;
  };
};

type AppSessionContextValue = AppSession & {
  updateProfile: (
    update: Partial<Pick<AppSession, "firstName" | "lastName" | "avatarUrl">>,
  ) => void;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

export function AppSessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: AppSession;
}) {
  const [currentSession, setCurrentSession] = useState(session);

  return (
    <AppSessionContext.Provider
      value={{
        ...currentSession,
        updateProfile: (update) =>
          setCurrentSession((current) => ({ ...current, ...update })),
      }}
    >
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession() {
  const session = useContext(AppSessionContext);

  if (!session) {
    throw new Error("AppSessionProvider non disponibile.");
  }

  return session;
}
