import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export const trackingProviderIds = ["meta", "ga4", "hotjar"] as const;
export type TrackingProviderId = (typeof trackingProviderIds)[number];

export const trackingEventIds = [
  "page_view",
  "view_content",
  "telegram_join_click",
  "lead",
  "complete_registration",
  "initiate_checkout",
  "purchase",
  "lead_purchase",
] as const;
export type TrackingEventId = (typeof trackingEventIds)[number];

export type TrackingScopes = {
  public: boolean;
  pm: boolean;
  admin: boolean;
};

export type TrackingSettings = {
  version: 1;
  providers: {
    meta: {
      enabled: boolean;
      pixelId: string;
      scopes: TrackingScopes;
    };
    ga4: {
      enabled: boolean;
      measurementId: string;
      scopes: TrackingScopes;
    };
    hotjar: {
      enabled: boolean;
      siteId: string;
      scopes: TrackingScopes;
    };
  };
  events: Record<
    TrackingEventId,
    {
      enabled: boolean;
      providers: TrackingProviderId[];
    }
  >;
};

export type TrackingEventDefinition = {
  id: TrackingEventId;
  label: string;
  description: string;
  trigger: string;
  source: "browser" | "server" | "hybrid";
  metaEventName: string | null;
};

const SETTINGS_KEY = "tracking.configuration";

const publicOnlyScopes: TrackingScopes = {
  public: true,
  pm: false,
  admin: false,
};

export const defaultTrackingSettings: TrackingSettings = {
  version: 1,
  providers: {
    meta: {
      enabled: false,
      pixelId: "",
      scopes: { ...publicOnlyScopes },
    },
    ga4: {
      enabled: false,
      measurementId: "",
      scopes: { ...publicOnlyScopes },
    },
    hotjar: {
      enabled: false,
      siteId: "",
      scopes: { ...publicOnlyScopes },
    },
  },
  events: {
    page_view: {
      enabled: false,
      providers: ["meta", "ga4"],
    },
    view_content: {
      enabled: false,
      providers: ["meta", "ga4", "hotjar"],
    },
    telegram_join_click: {
      enabled: false,
      providers: ["meta", "ga4", "hotjar"],
    },
    lead: {
      enabled: false,
      providers: ["meta", "ga4"],
    },
    complete_registration: {
      enabled: false,
      providers: ["meta", "ga4"],
    },
    initiate_checkout: {
      enabled: false,
      providers: ["meta", "ga4"],
    },
    purchase: {
      enabled: false,
      providers: ["meta", "ga4"],
    },
    lead_purchase: {
      enabled: false,
      providers: ["meta", "ga4"],
    },
  },
};

export const trackingEventCatalog: TrackingEventDefinition[] = [
  {
    id: "page_view",
    label: "Page View",
    description: "Visualizzazione o cambio pagina.",
    trigger: "Cambio route completato",
    source: "browser",
    metaEventName: "PageView",
  },
  {
    id: "view_content",
    label: "View Content",
    description: "Visualizzazione di una landing o del dettaglio di un lead.",
    trigger: "Apertura contenuto rilevante",
    source: "browser",
    metaEventName: "ViewContent",
  },
  {
    id: "telegram_join_click",
    label: "Clic Telegram",
    description: "Clic sul collegamento al canale Telegram.",
    trigger: "Clic CTA Telegram",
    source: "browser",
    metaEventName: null,
  },
  {
    id: "lead",
    label: "Lead",
    description: "Account Property Manager creato correttamente.",
    trigger: "Registrazione Supabase completata",
    source: "hybrid",
    metaEventName: "Lead",
  },
  {
    id: "complete_registration",
    label: "Registrazione completata",
    description: "Indirizzo email del Property Manager confermato.",
    trigger: "Callback conferma email",
    source: "hybrid",
    metaEventName: "CompleteRegistration",
  },
  {
    id: "initiate_checkout",
    label: "Avvio pagamento",
    description: "Creazione della sessione Stripe per la ricarica wallet.",
    trigger: "Checkout Stripe creato",
    source: "hybrid",
    metaEventName: "InitiateCheckout",
  },
  {
    id: "purchase",
    label: "Purchase",
    description: "Ricarica wallet confermata dal webhook Stripe.",
    trigger: "Pagamento Stripe confermato",
    source: "server",
    metaEventName: "Purchase",
  },
  {
    id: "lead_purchase",
    label: "Acquisto lead",
    description: "Acquisto di un lead tramite credito wallet.",
    trigger: "Acquisto wallet atomico completato",
    source: "server",
    metaEventName: null,
  },
];

type SettingsRow = {
  value: Json;
};

export async function fetchTrackingSettings(supabase: ServiceClient) {
  const settingsTable = supabase.from("settings") as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: SettingsRow | null;
          error: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
  const { data, error } = await settingsTable
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    return {
      settings: cloneDefaultTrackingSettings(),
      storageReady: false,
    };
  }

  return {
    settings: parseTrackingSettings(data?.value),
    storageReady: true,
  };
}

export async function saveTrackingSettings({
  supabase,
  profileId,
  settings,
}: {
  supabase: ServiceClient;
  profileId: string;
  settings: TrackingSettings;
}) {
  const normalizedSettings = parseTrackingSettings(settings as unknown as Json);
  const settingsTable = supabase.from("settings") as unknown as {
    upsert: (
      row: { key: string; value: Json; updated_by: string },
      options: { onConflict: string },
    ) => Promise<{ error: { code?: string; message?: string } | null }>;
  };
  const { error } = await settingsTable.upsert(
    {
      key: SETTINGS_KEY,
      value: normalizedSettings as unknown as Json,
      updated_by: profileId,
    },
    { onConflict: "key" },
  );

  if (error) throw error;

  return normalizedSettings;
}

function parseTrackingSettings(value: Json | undefined): TrackingSettings {
  const defaults = cloneDefaultTrackingSettings();

  if (!isJsonRecord(value)) return defaults;

  const providers = isJsonRecord(value.providers) ? value.providers : {};
  const events = isJsonRecord(value.events) ? value.events : {};

  return {
    version: 1,
    providers: {
      meta: parseProvider(providers.meta, defaults.providers.meta, "pixelId"),
      ga4: parseProvider(
        providers.ga4,
        defaults.providers.ga4,
        "measurementId",
      ),
      hotjar: parseProvider(providers.hotjar, defaults.providers.hotjar, "siteId"),
    },
    events: Object.fromEntries(
      trackingEventIds.map((eventId) => [
        eventId,
        parseEvent(events[eventId], defaults.events[eventId]),
      ]),
    ) as TrackingSettings["events"],
  };
}

function parseProvider<
  T extends {
    enabled: boolean;
    scopes: TrackingScopes;
  },
  K extends Exclude<keyof T, "enabled" | "scopes">,
>(value: Json | undefined, fallback: T, identifierKey: K): T {
  if (!isJsonRecord(value)) return { ...fallback, scopes: { ...fallback.scopes } };

  return {
    ...fallback,
    enabled: value.enabled === true,
    [identifierKey]:
      typeof value[String(identifierKey)] === "string"
        ? value[String(identifierKey)]
        : fallback[identifierKey],
    scopes: parseScopes(value.scopes, fallback.scopes),
  };
}

function parseScopes(value: Json | undefined, fallback: TrackingScopes) {
  if (!isJsonRecord(value)) return { ...fallback };

  return {
    public: typeof value.public === "boolean" ? value.public : fallback.public,
    pm: typeof value.pm === "boolean" ? value.pm : fallback.pm,
    admin: typeof value.admin === "boolean" ? value.admin : fallback.admin,
  };
}

function parseEvent(
  value: Json | undefined,
  fallback: TrackingSettings["events"][TrackingEventId],
) {
  if (!isJsonRecord(value)) {
    return { ...fallback, providers: [...fallback.providers] };
  }

  const providers = Array.isArray(value.providers)
    ? value.providers.filter(
        (provider): provider is TrackingProviderId =>
          typeof provider === "string" &&
          trackingProviderIds.includes(provider as TrackingProviderId),
      )
    : fallback.providers;

  return {
    enabled: value.enabled === true,
    providers: Array.from(new Set(providers)),
  };
}

function cloneDefaultTrackingSettings(): TrackingSettings {
  return {
    ...defaultTrackingSettings,
    providers: {
      meta: {
        ...defaultTrackingSettings.providers.meta,
        scopes: { ...defaultTrackingSettings.providers.meta.scopes },
      },
      ga4: {
        ...defaultTrackingSettings.providers.ga4,
        scopes: { ...defaultTrackingSettings.providers.ga4.scopes },
      },
      hotjar: {
        ...defaultTrackingSettings.providers.hotjar,
        scopes: { ...defaultTrackingSettings.providers.hotjar.scopes },
      },
    },
    events: Object.fromEntries(
      trackingEventIds.map((eventId) => [
        eventId,
        {
          ...defaultTrackingSettings.events[eventId],
          providers: [...defaultTrackingSettings.events[eventId].providers],
        },
      ]),
    ) as TrackingSettings["events"],
  };
}

function isJsonRecord(value: Json | undefined): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
