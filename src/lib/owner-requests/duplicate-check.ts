import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

type ServiceClient = SupabaseClient<Database>;

export type DuplicateCheckInput = {
  contact: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    preciseAddress?: string | null;
  };
  property: {
    region?: string | null;
    province?: string | null;
    city?: string | null;
    propertyType?: string | null;
  };
};

type DuplicateCandidate = {
  owner_request_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  precise_address: string | null;
};

type CandidateProperty = {
  owner_request_id: string;
  region: string | null;
  province: string | null;
  city: string | null;
  property_type: string | null;
};

type CandidateRequest = {
  id: string;
  status: string;
  created_at: string;
};

export type DuplicateCheckResult = {
  status: "clear" | "possible_duplicate" | "duplicate" | "unchecked";
  checked_at: string;
  match_count: number;
  highest_score: number;
  matches: Array<{
    owner_request_id: string;
    score: number;
    status: string;
    created_at: string;
    reasons: string[];
  }>;
};

export async function checkOwnerRequestDuplicates({
  supabase,
  input,
  currentOwnerRequestId,
}: {
  supabase: ServiceClient;
  input: DuplicateCheckInput;
  currentOwnerRequestId?: string;
}): Promise<DuplicateCheckResult> {
  const [contactsResult, propertiesResult, requestsResult] = await Promise.all([
    supabase
      .from("owner_contacts")
      .select("owner_request_id,first_name,last_name,email,phone,precise_address")
      .limit(600),
    supabase
      .from("properties")
      .select("owner_request_id,region,province,city,property_type")
      .limit(600),
    supabase
      .from("owner_requests")
      .select("id,status,created_at")
      .order("created_at", { ascending: false })
      .limit(600),
  ]);

  const checkedAt = new Date().toISOString();

  if (contactsResult.error || propertiesResult.error || requestsResult.error) {
    return {
      status: "unchecked",
      checked_at: checkedAt,
      match_count: 0,
      highest_score: 0,
      matches: [],
    };
  }

  const contacts = (contactsResult.data ?? []) as DuplicateCandidate[];
  const propertiesByRequestId = new Map(
    ((propertiesResult.data ?? []) as CandidateProperty[]).map((item) => [
      item.owner_request_id,
      item,
    ]),
  );
  const requestsById = new Map(
    ((requestsResult.data ?? []) as CandidateRequest[]).map((item) => [item.id, item]),
  );
  const matches = contacts
    .filter((candidate) => candidate.owner_request_id !== currentOwnerRequestId)
    .map((candidate) =>
      scoreCandidate({
        input,
        candidate,
        candidateProperty: propertiesByRequestId.get(candidate.owner_request_id),
        candidateRequest: requestsById.get(candidate.owner_request_id),
      }),
    )
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const highestScore = matches[0]?.score ?? 0;

  return {
    status:
      highestScore >= 90
        ? "duplicate"
        : highestScore >= 65
          ? "possible_duplicate"
          : "clear",
    checked_at: checkedAt,
    match_count: matches.length,
    highest_score: highestScore,
    matches,
  };
}

export function duplicateCheckToJson(result: unknown): Json {
  return JSON.parse(JSON.stringify(result)) as Json;
}

function scoreCandidate({
  input,
  candidate,
  candidateProperty,
  candidateRequest,
}: {
  input: DuplicateCheckInput;
  candidate: DuplicateCandidate;
  candidateProperty?: CandidateProperty;
  candidateRequest?: CandidateRequest;
}) {
  const reasons: string[] = [];
  let score = 0;

  if (normalizeEmail(input.contact.email) && normalizeEmail(input.contact.email) === normalizeEmail(candidate.email)) {
    score = Math.max(score, 100);
    reasons.push("Email proprietario già presente");
  }

  if (normalizePhone(input.contact.phone) && normalizePhone(input.contact.phone) === normalizePhone(candidate.phone)) {
    score = Math.max(score, 95);
    reasons.push("Telefono proprietario già presente");
  }

  const inputAddress = normalizeAddress(input.contact.preciseAddress);
  const candidateAddress = normalizeAddress(candidate.precise_address);
  const sameCity = sameText(input.property.city, candidateProperty?.city);

  if (inputAddress && candidateAddress && inputAddress === candidateAddress && sameCity) {
    score = Math.max(score, 90);
    reasons.push("Stesso indirizzo e stessa città");
  } else if (inputAddress && candidateAddress && sameCity && addressLooksSimilar(inputAddress, candidateAddress)) {
    score = Math.max(score, 70);
    reasons.push("Indirizzo molto simile nella stessa città");
  }

  const sameOwnerName =
    sameText(input.contact.firstName, candidate.first_name) &&
    sameText(input.contact.lastName, candidate.last_name);

  if (sameOwnerName && sameCity) {
    score = Math.max(score, 65);
    reasons.push("Stesso nome proprietario nella stessa città");
  }

  if (!score || !candidateRequest) return null;

  return {
    owner_request_id: candidate.owner_request_id,
    score,
    status: candidateRequest.status,
    created_at: candidateRequest.created_at,
    reasons,
  };
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (digits.startsWith("0039")) return digits.slice(4);
  if (digits.startsWith("39") && digits.length > 10) return digits.slice(2);

  return digits;
}

function normalizeAddress(value?: string | null) {
  return normalizeText(value)
    .replace(/\b(via|viale|corso|piazza|p\.zza|strada|largo)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .toLowerCase();
}

function sameText(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function addressLooksSimilar(left: string, right: string) {
  if (left.includes(right) || right.includes(left)) return true;

  const leftParts = new Set(left.split(" ").filter((part) => part.length > 2));
  const rightParts = right.split(" ").filter((part) => part.length > 2);

  if (!leftParts.size || !rightParts.length) return false;

  const common = rightParts.filter((part) => leftParts.has(part)).length;

  return common / Math.max(leftParts.size, rightParts.length) >= 0.75;
}
