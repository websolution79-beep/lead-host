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
      <header className="premium-header w-full min-w-0 max-w-full overflow-x-clip border-b border-ink/10">
        <div className="mx-auto w-full min-w-0 max-w-6xl px-5 py-6 sm:px-8">
          <p className="section-kicker">{eyebrow}</p>
          <h1 className="mt-2 break-words text-2xl font-semibold text-ink sm:text-3xl">
            {title}
          </h1>
        </div>
      </header>
      <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-clip px-5 py-8 sm:px-8">
        {children}
      </div>
    </>
  );
}
