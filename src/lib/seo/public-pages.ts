export const publicAudienceLinks = [
  {
    label: "Per Property Manager",
    path: "/",
  },
  {
    label: "Per proprietari",
    path: "/proprietari",
  },
  {
    label: "Accesso anticipato",
    path: "/accesso-anticipato",
  },
] as const;

export const publicSitemapPages = [
  {
    path: "/",
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    path: "/accesso-anticipato",
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    path: "/webinar",
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    path: "/proprietari",
    changeFrequency: "monthly",
    priority: 0.6,
  },
  {
    path: "/termini",
    changeFrequency: "yearly",
    priority: 0.2,
  },
] as const;
