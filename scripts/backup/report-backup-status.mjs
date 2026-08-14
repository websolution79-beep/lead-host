const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variabile obbligatoria mancante: ${name}`);
  return value;
};

const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const runId = required("BACKUP_RUN_ID");
const runUrl = required("BACKUP_RUN_URL");
const now = new Date().toISOString();

const normalizeStatus = (value) => {
  const status = String(value || "unknown").toLowerCase();
  return ["success", "failure", "cancelled", "skipped"].includes(status)
    ? status
    : "unknown";
};

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const components = JSON.parse(required("BACKUP_COMPONENTS_JSON"));
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

const currentResponse = await fetch(
  `${supabaseUrl}/rest/v1/backup_component_status?select=component,last_success_at`,
  { headers },
);
if (!currentResponse.ok) {
  throw new Error(`Monitoraggio backup non disponibile: ${await currentResponse.text()}`);
}

const current = new Map(
  (await currentResponse.json()).map((row) => [row.component, row]),
);
const rows = components.map((component) => {
  const status = normalizeStatus(component.status);
  const metadata = Object.fromEntries(
    Object.entries(component.metadata || {})
      .map(([key, value]) => [key, numberOrNull(value)])
      .filter(([, value]) => value !== null),
  );

  return {
    component: component.component,
    status,
    last_attempt_at: now,
    last_success_at:
      status === "success"
        ? now
        : current.get(component.component)?.last_success_at || null,
    run_id: runId,
    run_url: runUrl,
    metadata,
    updated_at: now,
  };
});

const response = await fetch(
  `${supabaseUrl}/rest/v1/backup_component_status?on_conflict=component`,
  {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  },
);
if (!response.ok) {
  throw new Error(`Salvataggio monitoraggio fallito: ${await response.text()}`);
}

console.log(`Stato backup aggiornato per: ${rows.map((row) => row.component).join(", ")}`);

