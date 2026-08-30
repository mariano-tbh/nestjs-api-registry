# nestjs-api-registry

> **Alpha software.** The public API may change without a major version bump until `1.0.0`.

A configurable [NestJS](https://nestjs.com/) module for registering and injecting one or more named, [axios](https://axios-http.com/)-based HTTP clients (`ApiClient`) into your application's dependency injection container.

## Installation

```bash
npm install nestjs-api-registry axios axios-retry
```

`@nestjs/common`, `@nestjs/core` and `reflect-metadata` are peer dependencies — install them if your project doesn't already have them (any NestJS 12 project will).

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

## Development

```bash
npm install
npm test           # run the test suite (vitest)
npm run lint        # oxlint
npm run format       # oxfmt (writes)
npm run format:check # oxfmt (check only, no writes)
npm run build        # compile to dist/
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).
