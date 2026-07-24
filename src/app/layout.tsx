import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      <body>
        {children}
        <GlobalSiteFooter />
      </body>
    </html>
  );
}
