import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadHostProGuide } from "../../../components/leadhostpro-guide";
import { SystemeFlowEditor } from "../../../components/systeme-flow-editor";
import { leadHostProBrand } from "../leadhostpro";
import guide from "../leadhostpro-guide.json";
import { initialSystemeFlowBindings } from "./editor";
import { systemeReasonLabels } from "./settings";

test("customer guide uses LeadHostPro branding and retains onboarding and identity limits", () => {
  const copy = JSON.stringify(guide);
  assert.ok(copy.includes(leadHostProBrand.name));
  assert.ok(copy.includes(leadHostProBrand.domain));
  assert.equal(/systeme/i.test(copy), false);
  assert.equal(new Set(guide.sections.map(section => section.id)).size, guide.sections.length);
  assert.ok(guide.sections.some(section => section.id === "contatti-ripetuti"));
  assert.ok(copy.includes("prima pagina di acquisizione"));
  assert.ok(copy.includes("una scheda per contatto"));
  assert.ok(copy.includes("segreto, mostrato una sola volta"));
  assert.ok(copy.includes("Mantieni in pausa l'importazione generale"));
});

test("guide renders accessible section anchors and structured tables without the upstream brand", () => {
  const markup = renderToStaticMarkup(createElement(LeadHostProGuide));
  assert.equal(/systeme/i.test(markup), false);
  for (const section of guide.sections) {
    assert.ok(markup.includes(`id="${section.id}"`));
    assert.ok(markup.includes(`href="#${section.id}"`));
  }
  assert.ok(markup.includes("scope=\"col\""));
  assert.ok(markup.includes("Risposte da LeadHostPro"));
});

test("mapping editor and customer event messages use the white-label name", () => {
  const markup = renderToStaticMarkup(createElement(SystemeFlowEditor, {
    draft: { id: "10000000-0000-4000-8000-000000000001", name: "Milano", enabled: false,
      importMode: "selected_pages", allowedPageUrls: ["https://example.test/milano"], destinationStageId: null,
      bindings: initialSystemeFlowBindings() },
    flows: [], stages: [], knownFields: [], busy: false, error: "", conflict: false,
    onChange() {}, onClose() {}, onSave() {}, onRefresh() {}, onReload() {},
  }));
  assert.ok(markup.includes("Campo LeadHostPro"));
  assert.equal(/systeme\.io/i.test(markup), false);
  assert.ok(systemeReasonLabels.missing_name.includes("LeadHostPro"));
  assert.ok(systemeReasonLabels.import_failed.includes("LeadHostPro"));
  assert.equal(/systeme\.io/i.test(JSON.stringify(systemeReasonLabels)), false);
});
