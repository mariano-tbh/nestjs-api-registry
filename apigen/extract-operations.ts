import type { OpenAPI3, OperationObject } from "openapi-typescript";
import { isReferenceObject } from "./open-api-utils.js";
import { sanitizeIdentifiers } from "./naming.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type ValidOperationObject = OperationObject & { operationId: string };

export interface OperationInfo {
  path: string;
  method: HttpMethod;
  /** Raw operationId from the spec. */
  operationId: string;
  /** Sanitized operationId, used as both the `<Name>Api` key and the class member name. */
  localOperationId: string;
  operation: ValidOperationObject;
}

/**
 * Walks an OpenAPI document's `paths` into a flat, order-stable list of
 * operations. Throws if an operation has no `operationId`, or if two
 * operationIds sanitize to the same identifier.
 *
 * $ref'd path items and operations are skipped -- not resolved -- in v1.
 */
export function extractOperations(document: OpenAPI3): OperationInfo[] {
  const raw: { path: string; method: HttpMethod; operation: ValidOperationObject }[] = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (isReferenceObject(pathItem)) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || isReferenceObject(operation)) continue;
      if (!operation.operationId) {
        throw new Error(
          `Operation ${method.toUpperCase()} ${path} has no "operationId"; apigen requires one per operation.`,
        );
      }
      raw.push({ path, method, operation: operation as ValidOperationObject });
    }
  }

  const localOperationIds = sanitizeIdentifiers(
    raw.map((entry) => entry.operation.operationId),
    "operationId",
  );

  return raw.map(({ path, method, operation }) => ({
    path,
    method,
    operationId: operation.operationId,
    localOperationId: localOperationIds.get(operation.operationId)!,
    operation,
  }));
}
