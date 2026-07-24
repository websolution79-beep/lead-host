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
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-6 text-center sm:px-8 lg:flex-row lg:text-left">
        <p className="text-sm font-medium text-slate-600">
          ©2026 – Lead Host - 17750971008 | All Right Reserved
        </p>
        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          aria-label="Link legali"
        >
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
        </nav>
      </div>
    </footer>
  );
}
