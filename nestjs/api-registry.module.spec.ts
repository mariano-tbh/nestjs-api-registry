import { Global, Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ApiClient } from "core/api-client.js";
import { Api, createApiInjectionToken } from "./api.decorator.js";
import { ApiRegistryModule } from "./api-registry.module.js";

@Injectable()
class MockConfigService {
  get(key: string): string {
    const values: Record<string, string> = {
      GLOBAL_BASE_URL: "https://global-async.example.com",
      CLIENT_A_BASE_URL: "https://client-a-async.example.com",
      CLIENT_B_BASE_URL: "https://client-b-async.example.com",
      FEATURE_BASE_URL: "https://feature-async.example.com",
    };
    return values[key] ?? "";
  }
}

@Global()
@Module({
  providers: [MockConfigService],
  exports: [MockConfigService],
})
class MockConfigModule {}

@Injectable()
class NamedClientAConsumer {
  constructor(@Api("A") public readonly client: ApiClient) {}
}

@Injectable()
class NamedClientBConsumer {
  constructor(@Api("B") public readonly client: ApiClient) {}
}

@Injectable()
class DefaultClientConsumer {
  constructor(public readonly client: ApiClient) {}
}

describe("ApiRegistryModule.forRoot", () => {
  it('configures the default client from "defaults" when no registry entries are given', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiRegistryModule.forRoot({
          defaults: { baseURL: "https://default.example.com" },
          registry: {},
        }),
      ],
    }).compile();

    const defaultClient = moduleRef.get(ApiClient);

    expect(defaultClient.axios.defaults.baseURL).toBe("https://default.example.com");
  });

  it("configures explicit named clients, merging registry options over defaults", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiRegistryModule.forRoot({
          defaults: { baseURL: "https://default.example.com", headers: { "X-Source": "defaults" } },
          registry: {
            A: { baseURL: "https://a.example.com" },
          },
        }),
      ],
      providers: [NamedClientAConsumer],
    }).compile();

    const defaultClient = moduleRef.get(ApiClient);
    const clientA = moduleRef.get<ApiClient>(createApiInjectionToken("A"));
    const consumerA = moduleRef.get(NamedClientAConsumer);

    expect(defaultClient.axios.defaults.baseURL).toBe("https://default.example.com");
    expect(clientA.axios.defaults.baseURL).toBe("https://a.example.com");
    expect(clientA.axios.defaults.headers).toMatchObject({ "X-Source": "defaults" });
    expect(consumerA.client).toBe(clientA);
  });
});

describe("ApiRegistryModule.forRootAsync", () => {
  it("configures multiple named clients using values resolved from an injected config module", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiRegistryModule.forRootAsync({
          imports: [MockConfigModule],
          inject: [MockConfigService],
          useFactory: (config: MockConfigService) => ({
            defaults: { baseURL: config.get("GLOBAL_BASE_URL") },
            registry: {
              A: { baseURL: config.get("CLIENT_A_BASE_URL") },
              B: { baseURL: config.get("CLIENT_B_BASE_URL") },
            },
          }),
        }),
      ],
      providers: [NamedClientAConsumer, NamedClientBConsumer],
    }).compile();

    const defaultClient = moduleRef.get(ApiClient);
    const consumerA = moduleRef.get(NamedClientAConsumer);
    const consumerB = moduleRef.get(NamedClientBConsumer);

    expect(defaultClient.axios.defaults.baseURL).toBe("https://global-async.example.com");
    expect(consumerA.client.axios.defaults.baseURL).toBe("https://client-a-async.example.com");
    expect(consumerB.client.axios.defaults.baseURL).toBe("https://client-b-async.example.com");
  });
});

describe("ApiRegistryModule.forFeature", () => {
  it("configures an ApiClient synchronously from the given options", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ApiRegistryModule.forFeature({ baseURL: "https://feature.example.com" })],
    }).compile();

    const client = moduleRef.get(ApiClient);

    expect(client.axios.defaults.baseURL).toBe("https://feature.example.com");
  });
});

describe("ApiRegistryModule.forFeatureAsync", () => {
  it("configures an ApiClient asynchronously from a mocked config module dependency", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiRegistryModule.forFeatureAsync({
          imports: [MockConfigModule],
          inject: [MockConfigService],
          useFactory: (config: MockConfigService) => ({
            baseURL: config.get("FEATURE_BASE_URL"),
          }),
        }),
      ],
    }).compile();

    const client = moduleRef.get(ApiClient);

    expect(client.axios.defaults.baseURL).toBe("https://feature-async.example.com");
  });
});

describe("scope precedence: global defaults vs. forFeature overrides", () => {
  @Module({
    imports: [ApiRegistryModule.forFeature({ baseURL: "https://feature-scope.example.com" })],
    providers: [DefaultClientConsumer],
    exports: [DefaultClientConsumer],
  })
  class FeatureModule {}

  @Module({
    providers: [DefaultClientConsumer],
    exports: [DefaultClientConsumer],
  })
  class GlobalOnlyModule {}

  it("an undecorated ApiClient injected in a module with no local registration gets the global defaults", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiRegistryModule.forRoot({
          defaults: { baseURL: "https://global-default.example.com" },
          registry: {},
        }),
        GlobalOnlyModule,
      ],
    }).compile();

    const consumer = moduleRef
      .select(GlobalOnlyModule)
      .get(DefaultClientConsumer, { strict: true });

    expect(consumer.client.axios.defaults.baseURL).toBe("https://global-default.example.com");
  });

  it("feature-level configuration takes precedence over the global default (least to most specific)", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiRegistryModule.forRoot({
          defaults: { baseURL: "https://global-default.example.com" },
          registry: {},
        }),
        FeatureModule,
      ],
    }).compile();

    const featureConsumer = moduleRef
      .select(FeatureModule)
      .get(DefaultClientConsumer, { strict: true });

    expect(featureConsumer.client.axios.defaults.baseURL).toBe("https://feature-scope.example.com");
  });

  it("an undecorated ApiClient injected in a forFeature-registered module uses the feature config, overriding the global default", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ApiRegistryModule.forRoot({
          defaults: { baseURL: "https://global-default.example.com" },
          registry: {},
        }),
        GlobalOnlyModule,
        FeatureModule,
      ],
    }).compile();

    const globalConsumer = moduleRef
      .select(GlobalOnlyModule)
      .get(DefaultClientConsumer, { strict: true });
    const featureConsumer = moduleRef
      .select(FeatureModule)
      .get(DefaultClientConsumer, { strict: true });

    expect(globalConsumer.client.axios.defaults.baseURL).toBe("https://global-default.example.com");
    expect(featureConsumer.client.axios.defaults.baseURL).toBe("https://feature-scope.example.com");
    expect(featureConsumer.client).not.toBe(globalConsumer.client);
  });
});
