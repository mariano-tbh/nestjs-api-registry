import type { OpenApiDocument, OpenApiParameter } from "./load-spec.js";
import { sanitizeIdentifiers } from "./naming.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OperationParam {
  /** The actual query/header/path param name to send on the wire. */
  wireName: string;
  /** The sanitized, valid-JS-identifier name exposed on the generated method's params object. */
  localName: string;
}

export interface Operation {
  /** Raw operationId from the spec. */
  operationId: string;
  /** Sanitized operationId, used as both the `<Name>Api` key and the class member name. */
  localOperationId: string;
  method: HttpMethod;
  path: string;
  pathParams: OperationParam[];
  queryParams: OperationParam[];
  headerParams: OperationParam[];
  hasRequestBody: boolean;
}

function toOperationParams(
  parameters: OpenApiParameter[],
  location: OpenApiParameter["in"],
  context: string,
): OperationParam[] {
  const matching = parameters.filter((parameter) => parameter.in === location);
  const localNames = sanitizeIdentifiers(
    matching.map((parameter) => parameter.name),
    `${context} (${location} parameters)`,
  );
  return matching.map((parameter) => ({
    wireName: parameter.name,
    localName: localNames.get(parameter.name)!,
  }));
}

/**
 * Walks an OpenAPI document's `paths` into a flat, order-stable list of
 * operations. Throws if an operation has no `operationId`, if two
 * operationIds sanitize to the same identifier, or if two parameters within
 * the same operation and location (path/query/header) sanitize to the same
 * local name.
 */
export function extractOperations(document: OpenApiDocument): Operation[] {
  const rawEntries: { path: string; method: HttpMethod; operationId: string }[] = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      if (!operation.operationId) {
        throw new Error(
          `Operation ${method.toUpperCase()} ${path} has no "operationId"; apigen requires one per operation.`,
        );
      }
      rawEntries.push({ path, method, operationId: operation.operationId });
    }
  }

  const localOperationIds = sanitizeIdentifiers(
    rawEntries.map((entry) => entry.operationId),
    "operationId",
  );

  return rawEntries.map(({ path, method }) => {
    const operation = document.paths[path]![method]!;
    const operationId = operation.operationId!;
    const parameters = operation.parameters ?? [];
    const context = `operation "${operationId}"`;
    const pathParams = toOperationParams(parameters, "path", context);
    const queryParams = toOperationParams(parameters, "query", context);
    const headerParams = toOperationParams(parameters, "header", context);

    // Path/query/header params all end up merged into one flat params object
    // on the generated method, so a collision across locations (e.g. a path
    // param and a query param both named "id") is just as unsafe as one
    // within a single location.
    const seenLocalNames = new Map<string, string>();
    for (const param of [...pathParams, ...queryParams, ...headerParams]) {
      const previousWireName = seenLocalNames.get(param.localName);
      if (previousWireName !== undefined) {
        throw new Error(
          `${context}: parameters "${previousWireName}" and "${param.wireName}" both sanitize to "${param.localName}" once merged into a single params object`,
        );
      }
      seenLocalNames.set(param.localName, param.wireName);
    }

    return {
      operationId,
      localOperationId: localOperationIds.get(operationId)!,
      method,
      path,
      pathParams,
      queryParams,
      headerParams,
      hasRequestBody: operation.requestBody != null,
    };
  });
}
