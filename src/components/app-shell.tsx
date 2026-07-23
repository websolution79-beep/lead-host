import type { ReactNode } from "react";

type AppShellProps = {
  title: string;
  eyebrow: string;
  children: ReactNode;
  section: "pm" | "admin";
};

export function AppShell({ title, eyebrow, children }: AppShellProps) {
  return (
    <>
      <header className="premium-header border-b border-ink/10">
        <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
          <p className="section-kicker">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">{title}</h1>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{children}</div>
    </>
  );
}
