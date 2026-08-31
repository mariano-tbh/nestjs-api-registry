import openapiTS, { astToString } from "openapi-typescript";
import type { Operation, OperationParam } from "./extract-operations.js";
import type { OpenApiDocument } from "./load-spec.js";
import { toScreamingSnakeCase } from "./naming.js";

export type ApiMode = "named" | "feature";

function pickSuccessStatus(document: OpenApiDocument, operation: Operation): string | undefined {
  const responses = document.paths[operation.path]?.[operation.method]?.responses;
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

function renderParamsType(operation: Operation): string {
  const allParams: OperationParam[] = [
    ...operation.pathParams,
    ...operation.queryParams,
    ...operation.headerParams,
  ];
  if (allParams.length === 0) {
    return "Record<string, never>";
  }
  const locations: [OperationParam[], "path" | "query" | "header"][] = [
    [operation.pathParams, "path"],
    [operation.queryParams, "query"],
    [operation.headerParams, "header"],
  ];
  const fields = locations.flatMap(([params, location]) =>
    params.map(
      (param) =>
        `${param.localName}: NonNullable<${operationTypeRef(operation.operationId)}["parameters"]["${location}"]>[${JSON.stringify(param.wireName)}]`,
    ),
  );
  return `{ ${fields.join("; ")} }`;
}

function renderBodyType(operation: Operation): string {
  if (!operation.hasRequestBody) {
    return "never";
  }
  const ref = operationTypeRef(operation.operationId);
  return `NonNullable<${ref}["requestBody"]> extends { content: { "application/json": infer B } } ? B : unknown`;
}

function renderResponseType(document: OpenApiDocument, operation: Operation): string {
  const status = pickSuccessStatus(document, operation);
  if (!status) {
    return "unknown";
  }
  const ref = operationTypeRef(operation.operationId);
  return `${ref}["responses"][${JSON.stringify(status)}] extends { content: { "application/json": infer R } } ? R : unknown`;
}

function renderApiInterface(
  name: string,
  document: OpenApiDocument,
  operations: Operation[],
): string {
  const entries = operations.map(
    (operation) =>
      `  ${operation.localOperationId}: {\n` +
      `    params: ${renderParamsType(operation)};\n` +
      `    body: ${renderBodyType(operation)};\n` +
      `    response: ${renderResponseType(document, operation)};\n` +
      `  };`,
  );
  return `export interface ${name}Api {\n${entries.join("\n")}\n}`;
}

function renderPathTemplate(operation: Operation): string {
  let template = operation.path;
  for (const param of operation.pathParams) {
    template = template.split(`{${param.wireName}}`).join(`\${args.${param.localName}}`);
  }
  return `\`${template}\``;
}

function renderRequestObjectFields(operation: Operation): string {
  const paramsObject = `{ ${operation.queryParams.map((p) => `${JSON.stringify(p.wireName)}: args.${p.localName}`).join(", ")} }`;
  const headersObject = `{ ${operation.headerParams.map((p) => `${JSON.stringify(p.wireName)}: args.${p.localName}`).join(", ")} }`;
  const fields = [
    `url: ${renderPathTemplate(operation)}`,
    `method: ${JSON.stringify(operation.method.toUpperCase())}`,
    `params: ${paramsObject}`,
    `headers: ${headersObject}`,
  ];
  if (operation.hasRequestBody) {
    fields.push("data: args.body");
  }
  fields.push("...config");
  return fields.join(",\n      ");
}

function renderClientMethod(name: string, operation: Operation): string {
  return (
    `  readonly ${operation.localOperationId}: MethodDefinition<${name}Api[${JSON.stringify(operation.localOperationId)}]> = (args, config) => {\n` +
    `    return this.apiClient.send<MethodResponse<${name}Api[${JSON.stringify(operation.localOperationId)}]>>({\n` +
    `      ${renderRequestObjectFields(operation)},\n` +
    "    });\n" +
    "  };"
  );
}

function renderNamedClient(name: string, operations: Operation[]): string {
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

function renderFeatureClient(name: string, operations: Operation[]): string {
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
  document: OpenApiDocument;
  operations: Operation[];
}

export async function render({ name, mode, document, operations }: RenderOptions): Promise<string> {
  const ast = await openapiTS(document as never);
  const schemaTypes = astToString(ast);

  const apiInterface = renderApiInterface(name, document, operations);
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
