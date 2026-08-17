import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adminApiErrorResponse,
  requireActiveTeamMember,
} from "@/lib/admin/auth";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  eventType: z
    .enum([
      "lead_verification",
      "prime_first_activation",
      "prime_renewal",
      "prime_lead_purchase",
      "refund_adjustment",
      "manual_adjustment",
    ])
    .optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

type RpcResult = {
  data: Record<string, unknown> | null;
  error: { message?: string } | null;
};

type ExportEvent = {
  eventType: string;
  status: string;
  amountCents: number;
  paidCents: number;
  description: string;
  occurredAt: string;
  propertyManagerFirstName: string | null;
  propertyManagerLastName: string | null;
  leadTitle: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, teamMemberId } = await requireActiveTeamMember(request);
    const query = querySchema.parse({
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
      dateFrom: request.nextUrl.searchParams.get("dateFrom") ?? undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") ?? undefined,
      eventType: request.nextUrl.searchParams.get("eventType") ?? undefined,
      format: request.nextUrl.searchParams.get("format") ?? undefined,
    });

    if (
      query.dateFrom &&
      query.dateTo &&
      new Date(query.dateFrom) >= new Date(query.dateTo)
    ) {
      return NextResponse.json(
        { error: "Il periodo selezionato non è valido." },
        { status: 422 },
      );
    }

    const rpc = supabase as unknown as {
      rpc: (
        fn:
          | "get_team_member_earnings_dashboard"
          | "get_team_member_earnings_report",
        args: Record<string, unknown>,
      ) => Promise<RpcResult>;
    };

    if (query.format === "csv") {
      const events = await loadAllEvents(rpc, teamMemberId, query);
      return new NextResponse(toCsv(events), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="guadagni-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const args = reportArgs(teamMemberId, query, query.page, query.pageSize);
    const [baseResult, reportResult] = await Promise.all([
      rpc.rpc("get_team_member_earnings_dashboard", {
        p_member_id: teamMemberId,
        p_page: 1,
        p_page_size: 1,
      }),
      rpc.rpc("get_team_member_earnings_report", args),
    ]);

    if (baseResult.error || !baseResult.data) {
      throw new Error(baseResult.error?.message ?? "Guadagni non disponibili.");
    }
    if (reportResult.error || !reportResult.data) {
      throw new Error(reportResult.error?.message ?? "Report guadagni non disponibile.");
    }

    return NextResponse.json({ ...baseResult.data, ...reportResult.data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function reportArgs(
  memberId: string,
  query: z.infer<typeof querySchema>,
  page: number,
  pageSize: number,
) {
  return {
    p_member_id: memberId,
    p_date_from: query.dateFrom ?? null,
    p_date_to: query.dateTo ?? null,
    p_event_type: query.eventType ?? null,
    p_page: page,
    p_page_size: pageSize,
  };
}

async function loadAllEvents(
  rpc: {
    rpc: (
      fn: "get_team_member_earnings_report",
      args: Record<string, unknown>,
    ) => Promise<RpcResult>;
  },
  memberId: string,
  query: z.infer<typeof querySchema>,
) {
  const events: ExportEvent[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const result = await rpc.rpc(
      "get_team_member_earnings_report",
      reportArgs(memberId, query, page, 100),
    );
    if (result.error || !result.data) {
      throw new Error(result.error?.message ?? "Esportazione guadagni non disponibile.");
    }
    events.push(...((result.data.events as ExportEvent[] | undefined) ?? []));
    const pagination = result.data.pagination as { totalPages?: number } | undefined;
    totalPages = Math.min(pagination?.totalPages ?? 1, 100);
    page += 1;
  } while (page <= totalPages);

  return events;
}

function toCsv(events: ExportEvent[]) {
  const rows = [
    ["Data", "Attività", "Descrizione", "Property Manager", "Lead", "Importo", "Pagato", "Stato"],
    ...events.map((event) => [
      new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.occurredAt)),
      eventTypeLabel(event.eventType),
      event.description,
      [event.propertyManagerFirstName, event.propertyManagerLastName].filter(Boolean).join(" "),
      event.leadTitle ?? "",
      (event.amountCents / 100).toFixed(2).replace(".", ","),
      (event.paidCents / 100).toFixed(2).replace(".", ","),
      event.status === "voided" ? "Annullato" : "Maturato",
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function eventTypeLabel(type: string) {
  if (type === "lead_verification") return "Verifica Lead";
  if (type === "prime_first_activation") return "Nuovo PM PRIME";
  if (type === "prime_renewal") return "Rinnovo PM PRIME";
  if (type === "prime_lead_purchase") return "Acquisto Lead PM PRIME";
  if (type === "refund_adjustment") return "Rettifica rimborso";
  return "Rettifica manuale";
}
