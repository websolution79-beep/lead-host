import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { GlobalSiteFooter } from "@/components/global-site-footer";
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
  metadataBase: new URL("https://leadhost.it"),
  title: {
    default: "Lead Host",
    template: "%s | Lead Host",
  },
  description:
    "Marketplace verticale per proprietari e Property Manager in Italia.",
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
_iub.csConfiguration = {"ccpaApplies":true,"consentOnContinuedBrowsing":false,"enableCcpa":true,"enableTcf":true,"invalidateConsentWithoutLog":true,"siteId":1201474,"tcfPurposes":{"1":true,"2":"consent_only","3":"consent_only","4":"consent_only","5":"consent_only","6":"consent_only","7":"consent_only","8":"consent_only","9":"consent_only","10":"consent_only"},"whitelabel":false,"cookiePolicyId":12644511,"banner":{"acceptButtonCaptionColor":"#FFFFFF","acceptButtonColor":"#0073CE","acceptButtonDisplay":true,"backgroundColor":"#FFFFFF","brandBackgroundColor":"#FFFFFF","brandTextColor":"#000000","closeButtonDisplay":false,"customizeButtonCaptionColor":"#4D4D4D","customizeButtonColor":"#DADADA","customizeButtonDisplay":true,"explicitWithdrawal":true,"listPurposes":true,"logo":null,"position":"bottom","rejectButtonDisplay":true,"slideDown":false,"textColor":"#000000"}};
_iub.csLangConfiguration = {"it":{"cookiePolicyId":12644511}};`,
          }}
        />
        <Script
          id="iubenda-sync"
          strategy="beforeInteractive"
          type="text/javascript"
          src="https://cs.iubenda.com/sync/1201474.js"
        />
        <Script
          id="iubenda-tcf-stub"
          strategy="beforeInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/tcf/stub-v2.js"
        />
        <Script
          id="iubenda-safe-tcf"
          strategy="beforeInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/tcf/safe-tcf-v2.js"
        />
        <Script
          id="iubenda-ccpa-stub"
          strategy="beforeInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/ccpa/stub.js"
        />
        <Script
          id="iubenda-cookie-solution"
          strategy="beforeInteractive"
          type="text/javascript"
          src="https://cdn.iubenda.com/cs/iubenda_cs.js"
          charSet="UTF-8"
        />
      </head>
      <body>
        {children}
        <GlobalSiteFooter />
      </body>
    </html>
  );
}
