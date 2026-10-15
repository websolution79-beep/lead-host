import { planSystemeFlowImport, systemeDiscoveryMetadata, type SystemeAdditionalAnswer, type SystemeMappedContact, type SystemeMappingWarning } from "./flow-payload";
import { systemeFlowListSchema, type SystemeFlowSnapshot } from "./flows";
import type { SystemeImportEvent, SystemeImportResult } from "./webhook";

export type SystemeAtomicFlowInput = {
  configurationToken: string;
  flowId: string | null;
  contact: SystemeMappedContact | null;
  additionalAnswers: SystemeAdditionalAnswer[];
  warnings: SystemeMappingWarning[];
  discoveredFields: { sourceSlug: string; fieldLabel: string | null }[];
  sourcePageUrl: string | null;
  rejectionReason: string | null;
};

export async function dispatchSystemeImport(event: SystemeImportEvent, dependencies: {
  loadSnapshot: () => Promise<SystemeFlowSnapshot>;
  importLegacy: () => Promise<SystemeImportResult>;
  importFlow: (input: SystemeAtomicFlowInput) => Promise<SystemeImportResult>;
}) {
  const snapshot = await dependencies.loadSnapshot();
  if (snapshot.routingMode === "legacy") return dependencies.importLegacy();
  const flows = systemeFlowListSchema.parse(snapshot.flows);
  const plan = planSystemeFlowImport(snapshot.enabled, flows, event.flowEnvelope);
  const protocolRejection = event.protocolRejectionReason;
  return dependencies.importFlow({
    configurationToken: snapshot.configurationToken,
    flowId: plan.flow?.id ?? null,
    contact: protocolRejection ? null : plan.mapped?.contact ?? null,
    additionalAnswers: protocolRejection ? [] : plan.mapped?.additionalAnswers ?? [],
    warnings: protocolRejection ? [] : plan.mapped?.warnings ?? [],
    discoveredFields: !protocolRejection && event.flowEnvelope
      ? systemeDiscoveryMetadata(event.flowEnvelope).map(({ sourceSlug, fieldLabel }) => ({ sourceSlug, fieldLabel })) : [],
    sourcePageUrl: event.flowEnvelope?.sourcePageUrl ?? null,
    rejectionReason: protocolRejection ?? plan.rejectionReason,
  });
}
