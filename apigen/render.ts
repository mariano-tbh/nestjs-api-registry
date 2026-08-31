import { pathToFileURL } from "node:url";
import openapiTS, {
  astToString,
  type OpenAPI3,
  type OperationObject,
  type ParameterObject,
} from "openapi-typescript";
import type { OperationInfo } from "./extract-operations.js";
import { isReferenceObject } from "./open-api-utils.js";
import { sanitizeIdentifiers, toScreamingSnakeCase } from "./naming.js";
import { resolveRef } from "./resolve-ref.js";
import { isUrl } from "./spec-location.js";

export type ApiMode = "named" | "feature";

interface PathParam {
  wireName: string;
  localName: string;
}

interface ResolvedOperationParams {
  pathParams: PathParam[];
  hasQuery: boolean;
  hasHeader: boolean;
}

// Path params are flattened onto the method's args object alongside
// "query"/"header"/"body" -- these three names are reserved so a path param
// sanitizing to one of them can't silently shadow it.
const RESERVED_ARG_KEYS = new Set(["query", "header", "body"]);

/**
 * Resolves `operation.parameters`, following any `$ref` entries (internal,
 * relative-file, or absolute URL -- see resolve-ref.ts). A ref that fails to
 * resolve (network error, bad pointer, ...) is skipped with a warning rather
 * than failing the whole generation -- that parameter just won't appear on
 * the generated method, since without resolving it we don't even know its
 * name or location (path/query/header).
 */
async function resolveParameters(
  operation: OperationObject,
  operationId: string,
  rootDocument: OpenAPI3,
  specLocation: string,
): Promise<ParameterObject[]> {
  const raw = operation.parameters ?? [];
  const resolved: ParameterObject[] = [];
  for (const entry of raw) {
    if (!isReferenceObject(entry)) {
      resolved.push(entry);
      continue;
    }
    try {
      resolved.push(await resolveRef<ParameterObject>(entry.$ref, rootDocument, specLocation));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `apigen: could not resolve parameter ref "${entry.$ref}" on operation "${operationId}" (${message}); skipping it.`,
      );
    }
  }
  return resolved;
}

async function resolveOperationParams(
  operation: OperationObject,
  operationId: string,
  rootDocument: OpenAPI3,
  specLocation: string,
): Promise<ResolvedOperationParams> {
  const params = await resolveParameters(operation, operationId, rootDocument, specLocation);

  const pathRaw = params.filter((parameter) => parameter.in === "path");
  const localNames = sanitizeIdentifiers(
    pathRaw.map((parameter) => parameter.name),
    `operation "${operationId}" path parameters`,
  );
  const pathParams = pathRaw.map((parameter) => {
    const localName = localNames.get(parameter.name)!;
    if (RESERVED_ARG_KEYS.has(localName)) {
      throw new Error(
        `operation "${operationId}": path parameter "${parameter.name}" sanitizes to "${localName}", which is reserved for the query/header/body fields`,
      );
    }
    return { wireName: parameter.name, localName };
  });

  return {
    pathParams,
    hasQuery: params.some((parameter) => parameter.in === "query"),
    hasHeader: params.some((parameter) => parameter.in === "header"),
  };
}

function pickSuccessStatus(operation: OperationObject): string | undefined {
  const responses = operation.responses;
  if (!responses) return undefined;
  const keys = Object.keys(responses);
  if (keys.includes("200")) return "200";
  if (keys.includes("201")) return "201";
  if (keys.includes("204")) return "204";
  return keys.find((key) => key.startsWith("2"));
}

function operationTypeRef(operationId: string): string {
  return `operations[${JSON.stringify(operationId)}]`;
}

function renderApiEntry(info: OperationInfo, resolved: ResolvedOperationParams): string {
  const { operation, operationId, localOperationId } = info;
  const ref = operationTypeRef(operationId);

  const paramsFields = resolved.pathParams.map(
    (param) =>
      `${param.localName}: NonNullable<${ref}["parameters"]["path"]>[${JSON.stringify(param.wireName)}]`,
  );
  const paramsType =
    paramsFields.length > 0 ? `{ ${paramsFields.join("; ")} }` : "Record<string, never>";

  const queryType = resolved.hasQuery ? `NonNullable<${ref}["parameters"]["query"]>` : "never";
  const headerType = resolved.hasHeader ? `NonNullable<${ref}["parameters"]["header"]>` : "never";
  const bodyType = operation.requestBody
    ? `NonNullable<${ref}["requestBody"]> extends { content: { "application/json": infer B } } ? B : unknown`
    : "never";

  const status = pickSuccessStatus(operation);
  const responseType = status
    ? `${ref}["responses"][${JSON.stringify(status)}] extends { content: { "application/json": infer R } } ? R : unknown`
    : "unknown";

  return (
    `  ${localOperationId}: {\n` +
    `    params: ${paramsType};\n` +
    `    query: ${queryType};\n` +
    `    header: ${headerType};\n` +
    `    body: ${bodyType};\n` +
    `    response: ${responseType};\n` +
    `  };`
  );
}

function renderApiInterface(
  name: string,
  operations: OperationInfo[],
  resolvedByOperationId: Map<string, ResolvedOperationParams>,
): string {
  const entries = operations.map((info) =>
    renderApiEntry(info, resolvedByOperationId.get(info.operationId)!),
  );
  return `export interface ${name}Api {\n${entries.join("\n")}\n}`;
}

function renderPathTemplate(path: string, pathParams: PathParam[]): string {
  let template = path;
  for (const param of pathParams) {
    template = template.split(`{${param.wireName}}`).join(`\${args.${param.localName}}`);
  }
  return `\`${template}\``;
}

function renderClientMethod(
  name: string,
  info: OperationInfo,
  resolved: ResolvedOperationParams,
): string {
  const { operation, localOperationId, path, method } = info;

  const fields = [
    `url: ${renderPathTemplate(path, resolved.pathParams)}`,
    `method: ${JSON.stringify(method.toUpperCase())}`,
  ];
  if (resolved.hasQuery) fields.push("params: args.query");
  if (resolved.hasHeader) fields.push("headers: args.header");
  if (operation.requestBody) fields.push("data: args.body");
  fields.push("...config");

  return (
    `  readonly ${localOperationId}: MethodDefinition<${name}Api[${JSON.stringify(localOperationId)}]> = (args, config) => {\n` +
    `    return this.apiClient.send<MethodResponse<${name}Api[${JSON.stringify(localOperationId)}]>>({\n` +
    `      ${fields.join(",\n      ")},\n` +
    "    });\n" +
    "  };"
  );
}

function renderNamedClient(
  name: string,
  operations: OperationInfo[],
  resolvedByOperationId: Map<string, ResolvedOperationParams>,
): string {
  const tokenName = `${toScreamingSnakeCase(name)}_CLIENT`;
  const methods = operations
    .map((info) => renderClientMethod(name, info, resolvedByOperationId.get(info.operationId)!))
    .join("\n\n");
  return (
    `export const ${tokenName} = Symbol(${JSON.stringify(tokenName)});\n\n` +
    `@Injectable()\n` +
    `export class ${name}Client {\n` +
    `  constructor(@Api(${tokenName}) private readonly apiClient: ApiClient) {}\n\n` +
    `${methods}\n` +
    "}"
  );
}

function renderFeatureClient(
  name: string,
  operations: OperationInfo[],
  resolvedByOperationId: Map<string, ResolvedOperationParams>,
): string {
  const methods = operations
    .map((info) => renderClientMethod(name, info, resolvedByOperationId.get(info.operationId)!))
    .join("\n\n");
  return (
    `@Injectable()\n` +
    `export class ${name}Client {\n` +
    `  constructor(private readonly apiClient: ApiClient) {}\n\n` +
    `${methods}\n` +
    "}\n\n" +
    `@Module({})\n` +
    `export class ${name}Module {\n` +
    `  static register(options: ApiClientOptions): DynamicModule {\n` +
    "    return {\n" +
    `      module: ${name}Module,\n` +
    `      imports: [ApiRegistryModule.forFeature(options)],\n` +
    `      providers: [${name}Client],\n` +
    `      exports: [${name}Client],\n` +
    "    };\n" +
    "  }\n\n" +
    "  static registerAsync(options: Parameters<typeof ApiRegistryModule.forFeatureAsync>[0]): DynamicModule {\n" +
    "    return {\n" +
    `      module: ${name}Module,\n` +
    `      imports: [ApiRegistryModule.forFeatureAsync(options)],\n` +
    `      providers: [${name}Client],\n` +
    `      exports: [${name}Client],\n` +
    "    };\n" +
    "  }\n" +
    "}"
  );
}

function renderImports(mode: ApiMode): string {
  const lines = [
    'import { Injectable, Module, type DynamicModule } from "@nestjs/common";',
    'import { ApiClient, type ApiClientOptions } from "nestjs-api-registry/core";',
    'import type { MethodDefinition, MethodResponse } from "nestjs-api-registry/apigen";',
  ];
  if (mode === "named") {
    lines.push('import { Api } from "nestjs-api-registry/nestjs";');
  } else {
    lines.push('import { ApiRegistryModule } from "nestjs-api-registry/nestjs";');
  }
  return lines.join("\n");
}

export interface RenderOptions {
  name: string;
  mode: ApiMode;
  document: OpenAPI3;
  operations: OperationInfo[];
  /** Where the spec was loaded from (URL or file path) -- used to resolve relative/external `$ref`s. */
  specLocation: string;
}

export async function render({
  name,
  mode,
  document,
  operations,
  specLocation,
}: RenderOptions): Promise<string> {
  // Pass openapi-typescript the spec's actual source location (not the
  // already-parsed `document`) so it loads and resolves external $refs
  // itself, the same way our own resolveRef resolves them. Passing `cwd` +
  // the parsed object instead does *not* reliably propagate to its
  // ref-resolution/bundling step (verified empirically) -- only handing it
  // the real URL does.
  const sourceUrl = isUrl(specLocation) ? new URL(specLocation) : pathToFileURL(specLocation);
  const ast = await openapiTS(sourceUrl);
  const schemaTypes = astToString(ast);

  const resolvedByOperationId = new Map<string, ResolvedOperationParams>();
  for (const info of operations) {
    resolvedByOperationId.set(
      info.operationId,
      await resolveOperationParams(info.operation, info.operationId, document, specLocation),
    );
  }

  const apiInterface = renderApiInterface(name, operations, resolvedByOperationId);
  const client =
    mode === "named"
      ? renderNamedClient(name, operations, resolvedByOperationId)
      : renderFeatureClient(name, operations, resolvedByOperationId);

  return [
    "// Generated by apigen -- do not edit by hand. Re-run `npx apigen` to regenerate.",
    "/* eslint-disable */",
    "",
    renderImports(mode),
    "",
    schemaTypes.trimEnd(),
    "",
    apiInterface,
    "",
    client,
    "",
  ].join("\n");
}
