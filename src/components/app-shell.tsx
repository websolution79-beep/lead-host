import type { ReactNode } from "react";
import Image from "next/image";
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
        <div className="w-full min-w-0 px-5 py-6 sm:px-8 xl:px-10 2xl:px-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="section-kicker">{eyebrow}</p>
              <h1 className="mt-2 break-words text-2xl font-semibold text-ink sm:text-3xl">
                {title}
              </h1>
            </div>
            {isPropertyManager ? (
              <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-sm sm:shrink-0">
                <a
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#1B8DC7] focus:outline-none focus:ring-2 focus:ring-[#229ED9] focus:ring-offset-2"
                  href="https://t.me/+nZiF2verYaUzNzg0"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Apri il canale Telegram Lead Host"
                  title="Apri il canale Telegram Lead Host"
                >
                  <Send aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 break-words text-center">Ricevi i nuovi immobili su Telegram</span>
                </a>
                <a
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-green px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-green focus:ring-offset-2"
                  href="https://chat.whatsapp.com/DkYCM4dsODCEOtu2mFooe1"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Apri la Community WhatsApp Lead Host"
                  title="Apri la Community WhatsApp Lead Host"
                >
                  <Image src="/images/workshop-whatsapp.svg" alt="" width={16} height={16} className="shrink-0 brightness-0 invert" />
                  <span className="min-w-0 break-words text-center">Ricevi i nuovi immobili su WhatsApp</span>
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <div className="w-full min-w-0 overflow-x-clip px-5 py-8 sm:px-8 xl:px-10 2xl:px-12">
        {children}
      </div>
    </>
  );
}
