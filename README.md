# nestjs-api-registry

> **Alpha software.** The public API may change without a major version bump until `1.0.0`.

A configurable [NestJS](https://nestjs.com/) module for registering and injecting one or more named, [axios](https://axios-http.com/)-based HTTP clients (`ApiClient`) into your application's dependency injection container.

## Installation

```bash
npm install nestjs-api-registry axios axios-retry
```

`axios`, `axios-retry`, `@nestjs/common`, `@nestjs/core` and `reflect-metadata` are peer dependencies. `axios` and `axios-retry` are peers (rather than regular dependencies) because their types (`AxiosRequestConfig`, `AxiosInstance`, `IAxiosRetryConfig`) are part of this package's public API — installing them yourself keeps a single shared version instead of risking a duplicate axios install alongside your own.

### Import paths

Everything is available from the package root, or from a per-module subpath if you only need one piece (better tree-shaking):

```ts
// everything
import { ApiClient, ApiRegistryModule, Api } from "nestjs-api-registry";

// just the plain axios-based client, no NestJS dependency
import { ApiClient } from "nestjs-api-registry/core";

// just the NestJS module + decorator
import { ApiRegistryModule, Api } from "nestjs-api-registry/nestjs";

// the OpenAPI client generator's programmatic API + the types generated
// clients import (see "Generating a client from an OpenAPI spec" below)
import { generateApiClient, type MethodDefinition } from "nestjs-api-registry/apigen";
```

## Quick start

Register the module once, at the root of your application, with a default client configuration:

```ts
// app.module.ts
import { Module } from "@nestjs/common";
import { ApiRegistryModule } from "nestjs-api-registry";

@Module({
  imports: [
    ApiRegistryModule.forRoot({
      defaults: {
        baseURL: "https://api.example.com",
        timeout: 5000,
      },
      registry: {},
    }),
  ],
})
export class AppModule {}
```

Inject the default `ApiClient` anywhere in your app — no decorator needed:

```ts
import { Injectable } from "@nestjs/common";
import { ApiClient } from "nestjs-api-registry";

@Injectable()
export class UsersService {
  constructor(private readonly apiClient: ApiClient) {}

  findAll() {
    return this.apiClient.get("/users");
  }
}
```

## Named clients

Register additional clients under a name in the `registry` map. Each entry is merged **on top of** `defaults`:

```ts
ApiRegistryModule.forRoot({
  defaults: { timeout: 5000 },
  registry: {
    payments: { baseURL: "https://payments.example.com" },
    inventory: { baseURL: "https://inventory.example.com" },
  },
});
```

Inject a named client with the `@Api()` parameter decorator:

```ts
import { Injectable } from "@nestjs/common";
import { Api, ApiClient } from "nestjs-api-registry";

@Injectable()
export class PaymentsService {
  constructor(@Api("payments") private readonly client: ApiClient) {}

  charge(orderId: string) {
    return this.client.post(`/orders/${orderId}/charge`);
  }
}
```

> The name passed to `@Api()` must have a matching entry in `registry`; otherwise the client falls back to an empty configuration (merged with `defaults`).

## Async configuration (`forRootAsync`)

Use `forRootAsync` when the client configuration depends on another module — e.g. a `ConfigModule`:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ApiRegistryModule } from "nestjs-api-registry";

@Module({
  imports: [
    ApiRegistryModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        defaults: { baseURL: config.get("API_BASE_URL") },
        registry: {
          payments: { baseURL: config.get("PAYMENTS_API_BASE_URL") },
        },
      }),
    }),
  ],
})
export class AppModule {}
```

By default `ApiRegistryModule.forRoot()`/`forRootAsync()` register the module **globally** (`isGlobal: true`), so the default `ApiClient` and every named client are available in any feature module without re-importing `ApiRegistryModule`.

## Feature-scoped clients (`forFeature` / `forFeatureAsync`)

A feature module can override the default `ApiClient` for everything declared inside it, taking precedence over the global default — configuration resolution goes from least to most specific (global defaults → feature module):

```ts
// payments/payments.module.ts
import { Module } from "@nestjs/common";
import { ApiRegistryModule } from "nestjs-api-registry";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [ApiRegistryModule.forFeature({ baseURL: "https://payments.example.com" })],
  providers: [PaymentsService],
})
export class PaymentsModule {}
```

```ts
// payments/payments.service.ts
import { Injectable } from "@nestjs/common";
import { ApiClient } from "nestjs-api-registry";

@Injectable()
export class PaymentsService {
  // No decorator: resolves to the ApiClient configured by forFeature() above,
  // not the one from ApiRegistryModule.forRoot() at the app root.
  constructor(private readonly client: ApiClient) {}
}
```

`forFeatureAsync` mirrors `forRootAsync`, but configures a single, feature-scoped client:

```ts
ApiRegistryModule.forFeatureAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    baseURL: config.get("PAYMENTS_API_BASE_URL"),
  }),
});
```

## `ApiClientOptions`

Options accepted by `defaults`, each `registry` entry, `forFeature()`, and the object returned by `forRootAsync`/`forFeatureAsync` factories:

| Option          | Type                                                                                  | Description                                                                 |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `...axios`      | `CreateAxiosDefaults` (minus `timeout`)                                               | Any option accepted by `axios.create()` — `baseURL`, `headers`, etc.        |
| `timeout`       | `number \| (config: InternalAxiosRequestConfig) => number`                            | Static timeout, or a function computed per-request.                         |
| `authStrategy`  | `(request: InternalAxiosRequestConfig) => void \| Promise<void>`                      | Runs as a request interceptor before every request — set auth headers, etc. |
| `retryStrategy` | `IAxiosRetryConfig` (from [`axios-retry`](https://www.npmjs.com/package/axios-retry)) | Enables automatic retries.                                                  |
| `setupInstance` | `(instance: AxiosInstance) => void`                                                   | Escape hatch to further configure the underlying axios instance directly.   |

## `ApiClient` methods

`ApiClient` wraps an axios instance and exposes the usual HTTP verbs, each resolving directly to `response.data`:

```ts
client.get<T>(url, config?)
client.post<T>(url, data?, config?)
client.put<T>(url, data?, config?)
client.patch<T>(url, data?, config?)
client.delete<T>(url, config?)
client.head<T>(url, config?)
client.options<T>(url, config?)
```

For anything not covered by the shortcuts above, use `send`, which accepts a full [`AxiosRequestConfig`](https://axios-http.com/docs/req_config) and is equivalent to `axios.request()`:

```ts
client.send<T>({ method: "GET", url: "/users", params: { active: true } });
```

The underlying axios instance is also available directly via `client.axios`.

## Generating a client from an OpenAPI spec

`apigen` reads an OpenAPI 3.x document (a URL or a local file, JSON or YAML) and generates a fully-typed, ready-to-use client class — one method per `operationId` — in either of the two shapes above.

```bash
npx apigen --spec https://petstore3.swagger.io/api/v3/openapi.json --name PetStore --mode named --out src/generated/pet-store.client.ts
```

- `--spec` — a URL or local path to the OpenAPI document.
- `--name` — PascalCase base name used to derive `PetStoreApi`, `PetStoreClient`, `PET_STORE_CLIENT` / `PetStoreModule`.
- `--mode` — `named` (a `@Api(TOKEN)`-injected class, register the token in `ApiRegistryModule.forRoot`'s `registry`) or `feature` (a self-contained `<Name>Module` with `register`/`registerAsync`, wrapping `ApiRegistryModule.forFeature`/`forFeatureAsync`).
- `--out` — where to write the generated `.ts` file.

The same thing is available programmatically, e.g. to wire into your own build script:

```ts
import { generateApiClient, generateApiClientSource } from "nestjs-api-registry/apigen";

// writes to outFile
await generateApiClient({
  spec: "https://petstore3.swagger.io/api/v3/openapi.json",
  name: "PetStore",
  mode: "named",
  outFile: "src/generated/pet-store.client.ts",
});

// or just get the source string back
const source = await generateApiClientSource({
  spec: "./openapi.yaml",
  name: "PetStore",
  mode: "feature",
});
```

Generated methods group their arguments by location — path params flattened directly onto the object, `body`/`query`/`header` each their own nested field (only present when the operation actually has one):

```ts
client.updatePetWithForm({
  petId: 1, // path param, flat
  query: { name: "Rex", status: "available" }, // query params, grouped
});

client.addPet({
  body: { name: "Rex", photoUrls: [] }, // JSON request body
});
```

Named mode:

```ts
export const PET_STORE_CLIENT = Symbol("PET_STORE_CLIENT");

@Injectable()
export class PetStoreClient {
  constructor(@Api(PET_STORE_CLIENT) private readonly apiClient: ApiClient) {}

  readonly getPetById: MethodDefinition<PetStoreApi["getPetById"]> = (args, config) => {
    return this.apiClient.send<MethodResponse<PetStoreApi["getPetById"]>>({
      url: `/pet/${args.petId}`,
      method: "GET",
      ...config,
    });
  };
  // ...one method per operationId
}
```

Feature mode additionally emits a self-contained `PetStoreModule` — importing it registers both the underlying `ApiClient` and `PetStoreClient` itself, so there's nothing else to wire up:

```ts
@Module({
  imports: [PetStoreModule.register({ baseURL: "https://petstore3.swagger.io/api/v3" })],
})
export class AppModule {}
```

A few v1 limitations, worth knowing before you rely on generated output:

- Every operation must have an `operationId`; apigen refuses to generate a client from an operation that doesn't.
- Only `application/json` request bodies and responses are typed; anything else (e.g. `multipart/form-data`) falls back to `unknown` for that field.
- The response type is the first 2xx status code found (preferring `200`, then `201`, then `204`).
- Path param names and operationIds are sanitized into valid camelCase identifiers (`get-by-id` → `getById`). Query and header param names are **not** renamed — they keep their original spec name as the key on `args.query`/`args.header`, since those two are always their own nested object rather than sharing a namespace with anything else (destructure the ones that are valid identifiers as-is, use bracket notation for the rest, e.g. `args.header["x-api-key"]`).
- Since path params are flattened onto the same object as `body`/`query`/`header`, apigen throws if a path param sanitizes to one of those three reserved names.
- `$ref`'d path items and parameter objects are not resolved in v1 and are skipped.

## Development

```bash
npm install
npm test           # run the test suite (vitest); also cleans any leftover build output first
npm run lint        # oxlint
npm run format       # oxfmt (writes)
npm run format:check # oxfmt (check only, no writes)
npm run build        # compile .js/.d.ts alongside the .ts sources (core/, nestjs/, index.ts)
npm run clean        # remove compiled .js/.d.ts output
```

`npm run build` emits `.js`/`.d.ts` files next to their `.ts` sources instead of into a separate `dist/` folder, so that the `./core` and `./nestjs` subpath exports resolve directly. These compiled files are git-ignored and only meant to exist transiently for publishing (`npm publish` runs `build` beforehand and `clean` afterward automatically).

## License

Apache-2.0 — see [LICENSE](./LICENSE).
