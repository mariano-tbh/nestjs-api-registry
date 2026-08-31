import type { OpenAPI3 } from "openapi-typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sampleDocument } from "./__fixtures__/sample-openapi.js";
import { writeTempSpec } from "./__fixtures__/write-temp-spec.js";
import { extractOperations } from "./extract-operations.js";
import { render } from "./render.js";

describe("render", () => {
  const operations = extractOperations(sampleDocument);
  let specLocation: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ file: specLocation, cleanup } = await writeTempSpec(sampleDocument));
  });

  afterAll(() => cleanup());

  it("named mode emits a Symbol token and @Api(TOKEN) injection", async () => {
    const source = await render({
      name: "Sample",
      mode: "named",
      document: sampleDocument,
      operations,
      specLocation,
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
      specLocation,
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
      specLocation,
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
      specLocation,
    });

    expect(source).toContain("url: `/pet/${args.petId}`");
  });

  it("groups query and header params under their own args field, referencing openapi-typescript's type directly", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
      specLocation,
    });
    const getByStatusEntry = source.slice(
      source.indexOf("getByStatus: {"),
      source.indexOf("body: never;", source.indexOf("getByStatus: {")),
    );

    expect(getByStatusEntry).toContain(
      'query: NonNullable<operations["get-by-status"]["parameters"]["query"]>;',
    );
    expect(getByStatusEntry).toContain(
      'header: NonNullable<operations["get-by-status"]["parameters"]["header"]>;',
    );

    const getByStatusMethod = source.slice(
      source.indexOf("readonly getByStatus"),
      source.indexOf("}", source.indexOf("readonly getByStatus")),
    );
    expect(getByStatusMethod).toContain("params: args.query");
    expect(getByStatusMethod).toContain("headers: args.header");
  });

  it("sets query/header to `never` for operations that don't have them", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
      specLocation,
    });
    const getPetByIdEntry = source.slice(
      source.indexOf("getPetById: {"),
      source.indexOf("response:", source.indexOf("getPetById: {")),
    );

    expect(getPetByIdEntry).toContain("query: never;");
    expect(getPetByIdEntry).toContain("header: never;");

    const getPetByIdMethod = source.slice(
      source.indexOf("readonly getPetById"),
      source.indexOf("}", source.indexOf("readonly getPetById")),
    );
    expect(getPetByIdMethod).not.toContain("params: args.query");
    expect(getPetByIdMethod).not.toContain("headers: args.header");
  });

  it("only attaches a body field for operations with a request body", async () => {
    const source = await render({
      name: "Sample",
      mode: "feature",
      document: sampleDocument,
      operations,
      specLocation,
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

describe("render: path param sanitizing to a reserved arg key", () => {
  const info = { title: "Test", version: "1.0.0" };

  it('throws when a path param sanitizes to "body", "query", or "header"', async () => {
    const document: OpenAPI3 = {
      openapi: "3.0.0",
      info,
      paths: {
        "/x/{body}": {
          get: {
            operationId: "getX",
            parameters: [{ name: "body", in: "path", required: true }],
          },
        },
      },
    };
    const operations = extractOperations(document);
    const { file: specLocation, cleanup } = await writeTempSpec(document);

    try {
      await expect(
        render({ name: "Sample", mode: "feature", document, operations, specLocation }),
      ).rejects.toThrow(/reserved/);
    } finally {
      await cleanup();
    }
  });
});

describe("render: resolves $ref parameters", () => {
  const info = { title: "Test", version: "1.0.0" };

  it("resolves an internal $ref parameter and folds it into query/header detection", async () => {
    const document: OpenAPI3 = {
      openapi: "3.0.0",
      info,
      paths: {
        "/x": {
          get: {
            operationId: "getX",
            parameters: [{ $ref: "#/components/parameters/PageParam" }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: {
        parameters: {
          PageParam: { name: "page", in: "query", schema: { type: "integer" } },
        },
      },
    };
    const operations = extractOperations(document);
    const { file: specLocation, cleanup } = await writeTempSpec(document);

    try {
      const source = await render({
        name: "Sample",
        mode: "feature",
        document,
        operations,
        specLocation,
      });

      expect(source).toContain('query: NonNullable<operations["getX"]["parameters"]["query"]>;');
      expect(source).toContain("params: args.query");
    } finally {
      await cleanup();
    }
  });

  it("resolves a $ref parameter pointing at an external, relative file", async () => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "apigen-test-ref-"));
    try {
      await writeFile(
        join(dir, "common.json"),
        JSON.stringify({
          parameters: { PageParam: { name: "page", in: "query", schema: { type: "integer" } } },
        }),
        "utf8",
      );

      const document: OpenAPI3 = {
        openapi: "3.0.0",
        info,
        paths: {
          "/x": {
            get: {
              operationId: "getX",
              parameters: [{ $ref: "./common.json#/parameters/PageParam" }],
              responses: { "200": { description: "ok" } },
            },
          },
        },
      };
      const operations = extractOperations(document);
      const specLocation = join(dir, "spec.json");
      await writeFile(specLocation, JSON.stringify(document), "utf8");

      const source = await render({
        name: "Sample",
        mode: "feature",
        document,
        operations,
        specLocation,
      });

      expect(source).toContain('query: NonNullable<operations["getX"]["parameters"]["query"]>;');
      expect(source).toContain("params: args.query");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
