import Link from "next/link";
import { publicAudienceLinks } from "@/lib/seo/public-pages";

const footerLinks = [
  {
    label: "Privacy Policy",
    href: "https://www.iubenda.com/privacy-policy/12644511",
  },
  {
    label: "Cookie Policy",
    href: "https://www.iubenda.com/privacy-policy/12644511/cookie-policy",
  },
  {
    label: "Termini e Condizioni",
    href: "https://www.leadhost.it/termini",
  },
] as const;

export function SiteFooter() {
  return (
    <footer id="site-footer" className="w-full min-w-0 max-w-full overflow-hidden border-t border-slate-200 bg-white">
      <div className="mx-auto grid w-full min-w-0 max-w-7xl gap-8 px-5 py-9 text-center sm:px-8 md:grid-cols-[1.3fr_0.8fr_0.9fr] md:text-left">
        <div>
          <Link
            href="/"
            className="text-base font-extrabold uppercase tracking-[0.14em] text-green"
          >
            Lead Host
          </Link>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
            Marketplace per Property Manager che cercano immobili da gestire
            per affitti brevi.
          </p>
          <p className="mt-4 text-sm font-medium text-slate-600">
            ©2026 – Lead Host - 17750971008 | All Right Reserved
          </p>
        </div>

        <nav
          aria-label="Pagine pubbliche"
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-900">
            Piattaforma
          </p>
          <div className="mt-3 flex flex-col items-center gap-2 md:items-start">
            {publicAudienceLinks.map((link) => (
              <Link
                key={link.path}
                className="text-sm font-semibold text-slate-600 underline-offset-4 transition hover:text-green hover:underline"
                href={link.path}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        <nav
          aria-label="Link legali"
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-900">
            Informazioni legali
          </p>
          <div className="mt-3 flex flex-col items-center gap-2 md:items-start">
            {footerLinks.map((link) => (
              <a
                key={link.href}
                className="text-sm font-semibold text-slate-600 underline-offset-4 transition hover:text-green hover:underline"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </footer>
  );
}
