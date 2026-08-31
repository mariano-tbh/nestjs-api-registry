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
 * operationIds sanitize to the same identifier, or if two *different*
 * parameter names within the same operation sanitize to the same local name
 * (e.g. a path param "user-id" and a query param "userId" would both become
 * "userId"). A parameter with the exact same wire name repeated across
 * locations (e.g. "api-version" sent as both a query param and a header) is
 * *not* a collision -- it's exposed once on the merged params object and the
 * generated method sends that one value to every location it appears in.
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
    // on the generated method. Two *different* wire names landing on the
    // same local name is unsafe (one would silently shadow the other) and
    // throws. The same wire name repeated across locations is fine -- it's
    // one shared value, exposed once, sent everywhere it's declared.
    const seenLocalNames = new Map<string, string>();
    for (const param of [...pathParams, ...queryParams, ...headerParams]) {
      const previousWireName = seenLocalNames.get(param.localName);
      if (previousWireName !== undefined && previousWireName !== param.wireName) {
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
