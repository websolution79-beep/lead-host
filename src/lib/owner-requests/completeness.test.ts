import assert from "node:assert/strict";
import test from "node:test";
import { getMissingLeadFields } from "@/lib/owner-requests/completeness";

test("reports missing owner, property and consent information", () => {
  const missing = getMissingLeadFields({
    contact: {
      firstName: "Mario",
      lastName: null,
      email: "",
      phone: null,
      preciseAddress: "Via Roma 10",
    },
    property: {
      region: "Lazio",
      province: "Roma",
      city: "Roma",
      propertyType: "Appartamento",
      bedrooms: 2,
      bathrooms: 1,
      areaSqm: 75,
      currentStatus: [],
      requestedServices: ["Gestione completa"],
      timing: null,
    },
    consents: {
      privacy: true,
      dataSharing: false,
    },
  });

  assert.deepEqual(
    missing.map((field) => field.key),
    [
      "lastName",
      "email",
      "phone",
      "currentStatus",
      "dataSharingConsent",
    ],
  );
});

test("accepts zero room counts as supplied values", () => {
  const missing = getMissingLeadFields({
    contact: {
      firstName: "Mario",
      lastName: "Rossi",
      email: "mario@example.com",
      phone: "3331234567",
      preciseAddress: "Via Roma 10",
    },
    property: {
      region: "Lazio",
      province: "Roma",
      city: "Roma",
      propertyType: "Monolocale",
      bedrooms: 0,
      bathrooms: 0,
      areaSqm: 30,
      currentStatus: ["Mai usato"],
      requestedServices: ["Gestione completa"],
      timing: "Entro 30 giorni",
    },
    consents: {
      privacy: true,
      dataSharing: true,
    },
  });

  assert.equal(missing.length, 0);
});

test("accepts the shortened owner form without services or timing", () => {
  const missing = getMissingLeadFields({
    contact: {
      firstName: "Mario",
      lastName: "Rossi",
      email: "mario@example.com",
      phone: "3331234567",
      preciseAddress: "Via Roma 10",
    },
    property: {
      region: "Lazio",
      province: "Roma",
      city: "Roma",
      propertyType: "Appartamento",
      bedrooms: 2,
      bathrooms: 1,
      areaSqm: 75,
      currentStatus: ["Mai usato per affitti brevi"],
    },
    consents: { privacy: true, dataSharing: true },
  });

  assert.deepEqual(missing, []);
});
