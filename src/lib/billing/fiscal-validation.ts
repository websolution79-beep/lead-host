export function normalizeItalianVatNumber(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/^IT/, "");
}

export function normalizeFiscalCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidItalianVatNumber(value: string | null | undefined) {
  const vatNumber = normalizeItalianVatNumber(value);

  if (!/^\d{11}$/.test(vatNumber)) return false;

  let total = 0;

  for (let index = 0; index < 10; index += 1) {
    const digit = Number(vatNumber[index]);

    if (index % 2 === 0) {
      total += digit;
    } else {
      const doubled = digit * 2;
      total += doubled > 9 ? doubled - 9 : doubled;
    }
  }

  const expectedCheckDigit = (10 - (total % 10)) % 10;

  return expectedCheckDigit === Number(vatNumber[10]);
}

export function isValidItalianFiscalCode(value: string | null | undefined) {
  const fiscalCode = normalizeFiscalCode(value);

  if (/^\d{11}$/.test(fiscalCode)) {
    return isValidItalianVatNumber(fiscalCode);
  }

  if (!/^[A-Z0-9]{16}$/.test(fiscalCode)) return false;

  const oddValues: Record<string, number> = {
    "0": 1,
    "1": 0,
    "2": 5,
    "3": 7,
    "4": 9,
    "5": 13,
    "6": 15,
    "7": 17,
    "8": 19,
    "9": 21,
    A: 1,
    B: 0,
    C: 5,
    D: 7,
    E: 9,
    F: 13,
    G: 15,
    H: 17,
    I: 19,
    J: 21,
    K: 2,
    L: 4,
    M: 18,
    N: 20,
    O: 11,
    P: 3,
    Q: 6,
    R: 8,
    S: 12,
    T: 14,
    U: 16,
    V: 10,
    W: 22,
    X: 25,
    Y: 24,
    Z: 23,
  };
  let total = 0;

  for (let index = 0; index < 15; index += 1) {
    const character = fiscalCode[index];

    if (index % 2 === 0) {
      total += oddValues[character];
    } else if (/\d/.test(character)) {
      total += Number(character);
    } else {
      total += character.charCodeAt(0) - 65;
    }
  }

  return String.fromCharCode(65 + (total % 26)) === fiscalCode[15];
}

export function isValidItalianPostalCode(value: string | null | undefined) {
  return /^\d{5}$/.test((value ?? "").trim());
}

export function isValidProvinceCode(value: string | null | undefined) {
  return /^[A-Z]{2}$/.test((value ?? "").trim().toUpperCase());
}

export function isValidSdiCode(value: string | null | undefined) {
  return /^[A-Z0-9]{7}$/.test((value ?? "").trim().toUpperCase());
}

export function isValidEmail(value: string | null | undefined) {
  const email = (value ?? "").trim();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
