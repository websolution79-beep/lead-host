import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { GlobalSiteFooter } from "@/components/global-site-footer";
import { GoogleAnalyticsTracker } from "@/components/google-analytics-tracker";
import { HotjarTracker } from "@/components/hotjar-tracker";
import { IubendaConsentBridge } from "@/components/iubenda-consent-bridge";
import { MetaPixelTracker } from "@/components/meta-pixel-tracker";
import { TelegramClickTracker } from "@/components/telegram-click-tracker";
import { ViewContentTracker } from "@/components/view-content-tracker";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.leadhost.it"),
  applicationName: "Lead Host",
  title: {
    default: "Lead Host | Marketplace per Property Manager",
    template: "%s | Lead Host",
  },
  description:
    "Lead Host è il marketplace italiano dove i Property Manager trovano richieste di proprietari interessati alla gestione per affitti brevi.",
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "Lead Host",
    title: "Lead Host | Marketplace per Property Manager",
    description:
      "Trova richieste di proprietari interessati agli affitti brevi e valuta ogni opportunità prima di acquistare il contatto.",
    images: [
      {
        url: "/images/lead-host-pm-hero.png",
        width: 1717,
        height: 916,
        alt: "Lead Host, marketplace per Property Manager",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lead Host | Marketplace per Property Manager",
    description:
      "Trova richieste di proprietari interessati agli affitti brevi e valuta ogni opportunità prima di acquistare il contatto.",
    images: ["/images/lead-host-pm-hero.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <Script
          id="iubenda-configuration"
          strategy="beforeInteractive"
          type="text/javascript"
          dangerouslySetInnerHTML={{
            __html: `var _iub = _iub || [];
_iub.csConfiguration = {"ccpaApplies":true,"consentOnContinuedBrowsing":false,"enableCcpa":true,"enableTcf":true,"invalidateConsentWithoutLog":true,"perPurposeConsent":true,"siteId":1201474,"tcfPurposes":{"1":true,"2":"consent_only","3":"consent_only","4":"consent_only","5":"consent_only","6":"consent_only","7":"consent_only","8":"consent_only","9":"consent_only","10":"consent_only"},"whitelabel":false,"cookiePolicyId":12644511,"callback":{"onReady":function(){window.dispatchEvent(new CustomEvent("leadhost:iubenda-ready"));},"onPreferenceExpressedOrNotNeeded":function(preference){window.dispatchEvent(new CustomEvent("leadhost:iubenda-preference",{"detail":preference||null}));},"onPreferenceFirstExpressed":function(preference){window.dispatchEvent(new CustomEvent("leadhost:iubenda-preference",{"detail":preference||null}));}},"banner":{"acceptButtonCaptionColor":"#FFFFFF","acceptButtonColor":"#0073CE","acceptButtonDisplay":true,"backgroundColor":"#FFFFFF","brandBackgroundColor":"#FFFFFF","brandTextColor":"#000000","closeButtonDisplay":false,"customizeButtonCaptionColor":"#4D4D4D","customizeButtonColor":"#DADADA","customizeButtonDisplay":true,"explicitWithdrawal":true,"listPurposes":true,"logo":null,"position":"bottom","rejectButtonDisplay":true,"slideDown":false,"textColor":"#000000"}};
_iub.csLangConfiguration = {"it":{"cookiePolicyId":12644511}};`,
          }}
        />
        <Script
          id="iubenda-sync"
          strategy="afterInteractive"
          type="text/javascript"
          src="https://cs.iubenda.com/sync/1201474.js"
        />
        <Script
          id="iubenda-tcf-stub"
          strategy="afterInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/tcf/stub-v2.js"
        />
        <Script
          id="iubenda-safe-tcf"
          strategy="afterInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/tcf/safe-tcf-v2.js"
        />
        <Script
          id="iubenda-ccpa-stub"
          strategy="afterInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/ccpa/stub.js"
        />
        <Script
          id="iubenda-cookie-solution"
          strategy="afterInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/iubenda_cs.js"
          charSet="UTF-8"
        />
      </head>
      <body>
        <IubendaConsentBridge />
        <MetaPixelTracker />
        <GoogleAnalyticsTracker />
        <HotjarTracker />
        <TelegramClickTracker />
        <ViewContentTracker />
        {children}
        <GlobalSiteFooter />
      </body>
    </html>
  );
}
