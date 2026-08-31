/**
 * Turns an arbitrary spec string (an operationId or a param name) into a
 * valid, camelCased JS identifier: "get-by-id" -> "getById",
 * "x-api-key" -> "xApiKey". Already-camelCase input (the common case for
 * operationIds) passes through untouched, since there's nothing to split on.
 */
export function sanitizeIdentifier(input: string): string {
  const parts = input.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Cannot derive a valid identifier from "${input}"`);
  }
  const joined = parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
  const identifier = joined.charAt(0).toLowerCase() + joined.slice(1);
  return /^[0-9]/.test(identifier) ? `_${identifier}` : identifier;
}

/**
 * "PetStore" / "pet-store" / "pet_store" -> "PET_STORE". Used to build the
 * named-mode injection token constant (with a "_CLIENT" suffix appended by
 * the caller).
 */
export function toScreamingSnakeCase(input: string): string {
  const withBoundaries = input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_");
  const words = withBoundaries.split("_").filter(Boolean);
  if (words.length === 0) {
    throw new Error(`Cannot derive a valid identifier from "${input}"`);
  }
  return words.map((word) => word.toUpperCase()).join("_");
}

/**
 * Applies `sanitizeIdentifier` across a list of raw names, throwing a clear
 * error if two different raw names collide on the same sanitized identifier.
 */
export function sanitizeIdentifiers(
  rawNames: readonly string[],
  context: string,
): Map<string, string> {
  const result = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const rawName of rawNames) {
    const identifier = sanitizeIdentifier(rawName);
    const previousRawName = seen.get(identifier);
    if (previousRawName !== undefined && previousRawName !== rawName) {
      throw new Error(
        `${context}: "${previousRawName}" and "${rawName}" collide on the same sanitized identifier "${identifier}"`,
      );
    }
    seen.set(identifier, rawName);
    result.set(rawName, identifier);
  }
  return result;
}
