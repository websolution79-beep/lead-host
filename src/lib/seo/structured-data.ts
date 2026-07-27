export const siteUrl = "https://www.leadhost.it";

export type SeoBreadcrumbItem = {
  name: string;
  path: string;
};

const organizationId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;

export const leadHostHomeStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "Lead Host",
      legalName: "SOGI",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/images/lead-host-logo.png`,
        width: 460,
        height: 94,
      },
      description:
        "Marketplace italiano che mette a disposizione dei Property Manager richieste di proprietari interessati alla gestione di immobili per affitti brevi.",
      email: "info@leadhost.it",
      vatID: "IT17750971008",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Via Cogliate",
        addressLocality: "Roma",
        addressCountry: "IT",
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "info@leadhost.it",
        availableLanguage: "Italian",
      },
      areaServed: {
        "@type": "Country",
        name: "Italia",
      },
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: siteUrl,
      name: "Lead Host",
      description:
        "Marketplace per Property Manager che cercano immobili da gestire per affitti brevi.",
      inLanguage: "it-IT",
      publisher: {
        "@id": organizationId,
      },
    },
  ],
};

export function createBreadcrumbStructuredData(items: SeoBreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, siteUrl).toString(),
    })),
  };
}
