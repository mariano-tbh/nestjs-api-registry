import { describe, expect, it } from "vitest";
import { sampleDocument } from "./__fixtures__/sample-openapi.js";
import { extractOperations } from "./extract-operations.js";
import type { OpenApiDocument } from "./load-spec.js";
import { render } from "./render.js";

describe("render", () => {
  const operations = extractOperations(sampleDocument);

  it("named mode emits a Symbol token and @Api(TOKEN) injection", async () => {
    const source = await render({
      name: "Sample",
      mode: "named",
      document: sampleDocument,
      operations,
    });

    expect(source).toContain('import { Api } from "nestjs-api-registry/nestjs";');
    expect(source).toContain('export const SAMPLE_CLIENT = Symbol("SAMPLE_CLIENT");');
    expect(source).toContain("export class SampleClient {");
    expect(source).toContain(
      "constructor(@Api(SAMPLE_CLIENT) private readonly apiClient: ApiClient) {}",
    );
    expect(source).not.toContain("SampleModule");
  });

  it("feature mode emits a self-contained module providing the client", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
    });

    expect(source).toContain('import { ApiRegistryModule } from "nestjs-api-registry/nestjs";');
    expect(source).toContain("constructor(private readonly apiClient: ApiClient) {}");
    expect(source).toContain("export class SampleModule {");
    expect(source).toContain("imports: [ApiRegistryModule.forFeature(options)],");
    expect(source).toContain("providers: [SampleClient],");
    expect(source).toContain("exports: [SampleClient],");
    expect(source).not.toContain("Symbol(");
  });

  it("keys the <Name>Api interface and class members by the sanitized operationId", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
    });

    expect(source).toContain("getByStatus: {");
    expect(source).toContain('readonly getByStatus: MethodDefinition<SampleApi["getByStatus"]>');
  });

  it("builds a path template substituting the sanitized param name", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
    });

    expect(source).toContain("url: `/pet/${args.petId}`");
  });

  it("routes query and header params to their own request fields, using the original wire name", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
    });

    expect(source).toContain('params: { "status": args.status }');
    expect(source).toContain('headers: { "x-api-key": args.xApiKey }');
  });

  it("only attaches a body field for operations with a request body", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
    });
    const addPetMethod = source.slice(
      source.indexOf("readonly addPet"),
      source.indexOf("readonly getByStatus"),
    );
    const getPetByIdMethod = source.slice(
      source.indexOf("readonly getPetById"),
      source.indexOf("readonly addPet"),
    );

    expect(addPetMethod).toContain("data: args.body");
    expect(getPetByIdMethod).not.toContain("data: args.body");
  });
});

describe("render: a param shared across locations (e.g. a version sent as both query and header)", () => {
  const sharedParamDocument = {
    openapi: "3.0.0",
    paths: {
      "/x": {
        get: {
          operationId: "getX",
          parameters: [
            { name: "api-version", in: "query", required: false },
            { name: "api-version", in: "header", required: false },
          ],
        },
      },
    },
  } satisfies OpenApiDocument;

  it("exposes the shared param once on the params object, and sends it to every location", async () => {
    const operations = extractOperations(sharedParamDocument);
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sharedParamDocument,
      operations,
    });

    // one field in the generated <Name>Api params type, not two
    expect(source.match(/apiVersion:/g)?.length).toBe(1);
    // but sent to both the query string and the header, from that one value
    expect(source).toContain('params: { "api-version": args.apiVersion }');
    expect(source).toContain('headers: { "api-version": args.apiVersion }');
  });
});
