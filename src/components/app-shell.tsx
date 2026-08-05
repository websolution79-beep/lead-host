import type { ReactNode } from "react";
import { Send } from "lucide-react";

type AppShellProps = {
  title: string;
  eyebrow: string;
  children: ReactNode;
  section: "pm" | "admin";
};

export function AppShell({ title, eyebrow, children, section }: AppShellProps) {
  const isPropertyManager = section === "pm";

  return (
    <>
      <header className="premium-header w-full min-w-0 max-w-full overflow-x-clip border-b border-ink/10">
        <div className="mx-auto w-full min-w-0 max-w-6xl px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="section-kicker">{eyebrow}</p>
              <h1 className="mt-2 break-words text-2xl font-semibold text-ink sm:text-3xl">
                {title}
              </h1>
            </div>
            {isPropertyManager ? (
              <a
                className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#1B8DC7] focus:outline-none focus:ring-2 focus:ring-[#229ED9] focus:ring-offset-2 sm:w-auto"
                href="https://t.me/+nZiF2verYaUzNzg0"
                target="_blank"
                rel="noreferrer"
                aria-label="Apri il canale Telegram Lead Host"
                title="Apri il canale Telegram Lead Host"
              >
                <Send aria-hidden="true" className="size-4" />
                <span className="sm:hidden">Aggiornamenti su Telegram</span>
                <span className="hidden sm:inline">
                  Ricevi nuovi immobili su Telegram
                </span>
              </a>
            ) : null}
          </div>
        </div>
      </header>
      <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-clip px-5 py-8 sm:px-8">
        {children}
      </div>
    </>
  );
}
