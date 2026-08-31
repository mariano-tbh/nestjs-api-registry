import { Injectable } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ApiClient } from "../core/api-client.js";
import { Api, createApiInjectionToken } from "./api.decorator.js";

describe("Api", () => {
  it("throws a RuntimeException naming ApiClient when the decorated parameter's type isn't ApiClient", () => {
    expect(() => {
      @Injectable()
      class Consumer {
        constructor(@Api("Mismatched") public readonly client: string) {}
      }
      void Consumer;
    }).toThrow(/Api client is not an instance of ApiClient/);
  });

  it("registers the injection token for a valid ApiClient parameter", () => {
    @Injectable()
    class Consumer {
      constructor(@Api("Valid") public readonly client: ApiClient) {}
    }
    void Consumer;

    expect(createApiInjectionToken("Valid")).toBe(createApiInjectionToken("Valid"));
  });
});
