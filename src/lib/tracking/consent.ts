import type {
  TrackingProviderId,
  TrackingSettings,
} from "@/lib/config/tracking-settings";

export const IUBENDA_MEASUREMENT_PURPOSE = "4";
export const IUBENDA_MARKETING_PURPOSE = "5";
export const TRACKING_CONSENT_EVENT = "leadhost:tracking-consent-change";
export const IUBENDA_PREFERENCE_EVENT = "leadhost:iubenda-preference";
export const IUBENDA_READY_EVENT = "leadhost:iubenda-ready";

export type TrackingConsentState = {
  resolved: boolean;
  measurement: boolean;
  marketing: boolean;
  source: "pending" | "iubenda";
  updatedAt: string | null;
};

export type TrackingScopeId = "public" | "pm" | "admin";

export const pendingTrackingConsent: TrackingConsentState = {
  resolved: false,
  measurement: false,
  marketing: false,
  source: "pending",
  updatedAt: null,
};

export const providerConsentRequirements: Record<
  TrackingProviderId,
  {
    category: "measurement" | "marketing";
    label: string;
    purposeId: string;
  }
> = {
  meta: {
    category: "marketing",
    label: "Marketing",
    purposeId: IUBENDA_MARKETING_PURPOSE,
  },
  ga4: {
    category: "measurement",
    label: "Misurazione",
    purposeId: IUBENDA_MEASUREMENT_PURPOSE,
  },
  hotjar: {
    category: "measurement",
    label: "Misurazione",
    purposeId: IUBENDA_MEASUREMENT_PURPOSE,
  },
};

export function parseIubendaConsent(
  preference: unknown,
): TrackingConsentState {
  if (!isRecord(preference)) return { ...pendingTrackingConsent };

  if (preference.consent === true) {
    return resolvedConsent(true, true);
  }

  if (preference.consent === false) {
    return resolvedConsent(false, false);
  }

  if (!isRecord(preference.purposes)) {
    return { ...pendingTrackingConsent };
  }

  return resolvedConsent(
    preference.purposes[IUBENDA_MEASUREMENT_PURPOSE] === true,
    preference.purposes[IUBENDA_MARKETING_PURPOSE] === true,
  );
}

export function hasProviderConsent(
  providerId: TrackingProviderId,
  consent: TrackingConsentState,
) {
  if (!consent.resolved) return false;

  return providerConsentRequirements[providerId].category === "marketing"
    ? consent.marketing
    : consent.measurement;
}

export function canActivateTrackingProvider({
  settings,
  providerId,
  scope,
  consent,
}: {
  settings: TrackingSettings;
  providerId: TrackingProviderId;
  scope: TrackingScopeId;
  consent: TrackingConsentState;
}) {
  const provider = settings.providers[providerId];

  return (
    provider.enabled &&
    Boolean(getProviderIdentifier(settings, providerId)) &&
    provider.scopes[scope] &&
    hasProviderConsent(providerId, consent)
  );
}

function resolvedConsent(
  measurement: boolean,
  marketing: boolean,
): TrackingConsentState {
  return {
    resolved: true,
    measurement,
    marketing,
    source: "iubenda",
    updatedAt: new Date().toISOString(),
  };
}

function getProviderIdentifier(
  settings: TrackingSettings,
  providerId: TrackingProviderId,
) {
  if (providerId === "meta") return settings.providers.meta.pixelId;
  if (providerId === "ga4") return settings.providers.ga4.measurementId;
  return settings.providers.hotjar.siteId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

declare global {
  interface Window {
    __leadHostTrackingConsent?: TrackingConsentState;
    _iub?: {
      cs?: {
        api?: {
          getPreferences?: () => unknown;
        };
      };
    };
  }

  interface WindowEventMap {
    [TRACKING_CONSENT_EVENT]: CustomEvent<TrackingConsentState>;
    [IUBENDA_PREFERENCE_EVENT]: CustomEvent<unknown>;
    [IUBENDA_READY_EVENT]: CustomEvent<void>;
  }
}
