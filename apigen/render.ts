import openapiTS, {
  astToString,
  type OpenAPI3,
  type OperationObject,
  type ParameterObject,
} from "openapi-typescript";
import type { OperationInfo } from "./extract-operations.js";
import { isReferenceObject } from "./open-api-utils.js";
import { sanitizeIdentifiers, toScreamingSnakeCase } from "./naming.js";

export type ApiMode = "named" | "feature";

interface PathParam {
  wireName: string;
  localName: string;
}

// Path params are flattened onto the method's args object alongside
// "query"/"header"/"body" -- these three names are reserved so a path param
// sanitizing to one of them can't silently shadow it.
const RESERVED_ARG_KEYS = new Set(["query", "header", "body"]);

function getPathParams(operation: OperationObject, operationId: string): PathParam[] {
  const params = (operation.parameters ?? []).filter(
    (parameter): parameter is ParameterObject =>
      !isReferenceObject(parameter) && parameter.in === "path",
  );
  const localNames = sanitizeIdentifiers(
    params.map((parameter) => parameter.name),
    `operation "${operationId}" path parameters`,
  );
  return params.map((parameter) => {
    const localName = localNames.get(parameter.name)!;
    if (RESERVED_ARG_KEYS.has(localName)) {
      throw new Error(
        `operation "${operationId}": path parameter "${parameter.name}" sanitizes to "${localName}", which is reserved for the query/header/body fields`,
      );
    }
    return { wireName: parameter.name, localName };
  });
}

function hasParamsIn(operation: OperationObject, location: "query" | "header"): boolean {
  return (operation.parameters ?? []).some(
    (parameter) => !isReferenceObject(parameter) && parameter.in === location,
  );
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

function renderApiEntry(info: OperationInfo): string {
  const { operation, operationId, localOperationId } = info;
  const ref = operationTypeRef(operationId);
  const pathParams = getPathParams(operation, operationId);

  const paramsFields = pathParams.map(
    (param) =>
      `${param.localName}: NonNullable<${ref}["parameters"]["path"]>[${JSON.stringify(param.wireName)}]`,
  );
  const paramsType =
    paramsFields.length > 0 ? `{ ${paramsFields.join("; ")} }` : "Record<string, never>";

  const queryType = hasParamsIn(operation, "query")
    ? `NonNullable<${ref}["parameters"]["query"]>`
    : "never";
  const headerType = hasParamsIn(operation, "header")
    ? `NonNullable<${ref}["parameters"]["header"]>`
    : "never";
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

function renderApiInterface(name: string, operations: OperationInfo[]): string {
  return `export interface ${name}Api {\n${operations.map(renderApiEntry).join("\n")}\n}`;
}

function renderPathTemplate(path: string, pathParams: PathParam[]): string {
  let template = path;
  for (const param of pathParams) {
    template = template.split(`{${param.wireName}}`).join(`\${args.${param.localName}}`);
  }
  return `\`${template}\``;
}

function renderClientMethod(name: string, info: OperationInfo): string {
  const { operation, operationId, localOperationId, path, method } = info;
  const pathParams = getPathParams(operation, operationId);

  const fields = [
    `url: ${renderPathTemplate(path, pathParams)}`,
    `method: ${JSON.stringify(method.toUpperCase())}`,
  ];
  if (hasParamsIn(operation, "query")) fields.push("params: args.query");
  if (hasParamsIn(operation, "header")) fields.push("headers: args.header");
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

function renderNamedClient(name: string, operations: OperationInfo[]): string {
  const tokenName = `${toScreamingSnakeCase(name)}_CLIENT`;
  const methods = operations.map((operation) => renderClientMethod(name, operation)).join("\n\n");
  return (
    `export const ${tokenName} = Symbol(${JSON.stringify(tokenName)});\n\n` +
    `@Injectable()\n` +
    `export class ${name}Client {\n` +
    `  constructor(@Api(${tokenName}) private readonly apiClient: ApiClient) {}\n\n` +
    `${methods}\n` +
    "}"
  );
}

function renderFeatureClient(name: string, operations: OperationInfo[]): string {
  const methods = operations.map((operation) => renderClientMethod(name, operation)).join("\n\n");
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
}

export async function render({ name, mode, document, operations }: RenderOptions): Promise<string> {
  const ast = await openapiTS(document);
  const schemaTypes = astToString(ast);

  const apiInterface = renderApiInterface(name, operations);
  const client =
    mode === "named" ? renderNamedClient(name, operations) : renderFeatureClient(name, operations);

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
