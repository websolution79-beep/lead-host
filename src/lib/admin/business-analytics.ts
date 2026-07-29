export type AnalyticsRangeKey =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "currentMonth"
  | "previousMonth"
  | "currentYear"
  | "custom";

export type AnalyticsMetricSet = {
  ownerRequests: number;
  completedRequests: number;
  pendingRequests: number;
  publishedLeads: number;
  rejectedLeads: number;
  expiredLeads: number;
  soldLeads: number;
  exhaustedLeads: number;
  purchases: number;
  sharedPurchases: number;
  exclusivePurchases: number;
  purchaseValueCents: number;
  sharedValueCents: number;
  exclusiveValueCents: number;
  uniqueBuyers: number;
  averagePurchaseCents: number;
  averageRevenuePerLeadCents: number;
  averagePurchasesPerBuyer: number;
  repeatBuyerRate: number;
  topUpCount: number;
  topUpCents: number;
  uniqueTopUpPms: number;
  averageTopUpCents: number;
  firstTopUps: number;
  repeatTopUps: number;
  refundCount: number;
  refundCents: number;
  netLeadValueCents: number;
  newPropertyManagers: number;
  newPmBuyerRate: number;
  publicationRate: number;
  invalidRate: number;
  sellThroughRate: number;
  averagePublishHours: number;
  averageFirstPurchaseHours: number;
};

export type AnalyticsCountRow = {
  key?: string;
  label: string;
  value: number;
};

export type BusinessAnalyticsPayload = {
  generatedAt: string;
  timezone: "Europe/Rome";
  range: {
    key: AnalyticsRangeKey;
    label: string;
    fromDate: string;
    toDate: string;
    previousFromDate: string;
    previousToDate: string;
    bucket: "day" | "month";
  };
  snapshot: {
    walletBalanceCents: number;
    pendingReview: number;
    waitingCompletion: number;
    duplicateWarnings: number;
    availableLeads: number;
    expiringSoon: number;
    supportAwaitingAdmin: number;
    pendingRefunds: number;
    invoicesToManage: number;
    activePropertyManagers: number;
  };
  current: AnalyticsMetricSet;
  previous: AnalyticsMetricSet;
  trends: Array<{
    date: string;
    label: string;
    ownerRequests: number;
    publishedLeads: number;
    purchases: number;
    purchaseValueCents: number;
    topUpCents: number;
  }>;
  funnel: AnalyticsCountRow[];
  dimensions: {
    acquisitionChannels: AnalyticsCountRow[];
    topCities: AnalyticsCountRow[];
    propertyTypes: AnalyticsCountRow[];
    topServices: AnalyticsCountRow[];
  };
  operations: {
    leadStatuses: AnalyticsCountRow[];
    supportStatuses: AnalyticsCountRow[];
    invoiceStatuses: AnalyticsCountRow[];
  };
  recentActivity: Array<{
    type: string;
    label: string;
    detail: string;
    amountCents: number | null;
    href: string;
    createdAt: string;
  }>;
  error?: string;
};

export const DASHBOARD_RANGE_OPTIONS: Array<{
  key: AnalyticsRangeKey;
  label: string;
}> = [
  { key: "today", label: "Oggi" },
  { key: "yesterday", label: "Ieri" },
  { key: "last7", label: "Ultimi 7 giorni" },
  { key: "last30", label: "Ultimi 30 giorni" },
];

export const ANALYTICS_RANGE_OPTIONS: Array<{
  key: AnalyticsRangeKey;
  label: string;
}> = [
  ...DASHBOARD_RANGE_OPTIONS,
  { key: "currentMonth", label: "Mese corrente" },
  { key: "previousMonth", label: "Mese scorso" },
  { key: "currentYear", label: "Anno corrente" },
  { key: "custom", label: "Periodo personalizzato" },
];

export function resolveAnalyticsRange({
  key,
  customFrom,
  customTo,
}: {
  key: AnalyticsRangeKey;
  customFrom?: string | null;
  customTo?: string | null;
}) {
  const today = getRomeCalendarDate();
  let fromDate = today;
  let toDateExclusive = addDays(today, 1);
  let label = "Oggi";

  if (key === "yesterday") {
    fromDate = addDays(today, -1);
    toDateExclusive = today;
    label = "Ieri";
  } else if (key === "last7") {
    fromDate = addDays(today, -6);
    label = "Ultimi 7 giorni";
  } else if (key === "last30") {
    fromDate = addDays(today, -29);
    label = "Ultimi 30 giorni";
  } else if (key === "currentMonth") {
    fromDate = startOfMonth(today);
    label = "Mese corrente";
  } else if (key === "previousMonth") {
    toDateExclusive = startOfMonth(today);
    fromDate = addMonths(toDateExclusive, -1);
    label = "Mese scorso";
  } else if (key === "currentYear") {
    fromDate = `${today.slice(0, 4)}-01-01`;
    label = "Anno corrente";
  } else if (key === "custom") {
    if (!isCalendarDate(customFrom) || !isCalendarDate(customTo)) {
      throw new Error("Seleziona una data iniziale e una data finale valide.");
    }

    if (customFrom > customTo) {
      throw new Error("La data iniziale non può essere successiva alla data finale.");
    }

    fromDate = customFrom;
    toDateExclusive = addDays(customTo, 1);
    label = `${formatCalendarDate(customFrom)} – ${formatCalendarDate(customTo)}`;
  }

  const dayCount = daysBetween(fromDate, toDateExclusive);

  if (dayCount > 731) {
    throw new Error("Il periodo massimo selezionabile è di 24 mesi.");
  }

  let previousToDate = fromDate;
  let previousFromDate = addDays(previousToDate, -dayCount);

  if (key === "currentMonth" || key === "currentYear") {
    previousFromDate =
      key === "currentMonth"
        ? addMonths(fromDate, -1)
        : `${Number(fromDate.slice(0, 4)) - 1}-01-01`;
    previousToDate = addDays(previousFromDate, dayCount);
    if (previousToDate > fromDate) previousToDate = fromDate;
  } else if (key === "previousMonth") {
    previousToDate = fromDate;
    previousFromDate = addMonths(fromDate, -1);
  }

  return {
    key,
    label,
    fromDate,
    toDate: addDays(toDateExclusive, -1),
    toDateExclusive,
    previousFromDate,
    previousToDate,
    bucket: dayCount > 120 ? ("month" as const) : ("day" as const),
  };
}

function getRomeCalendarDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function isCalendarDate(value?: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function startOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, months: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);

  return date.toISOString().slice(0, 10);
}

function daysBetween(fromDate: string, toDate: string) {
  return Math.round(
    (Date.parse(`${toDate}T00:00:00.000Z`)
      - Date.parse(`${fromDate}T00:00:00.000Z`))
      / 86_400_000,
  );
}

function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
