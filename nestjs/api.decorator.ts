import { randomUUID } from "node:crypto";

import { RuntimeException } from "@nestjs/core/internal";
import { Inject } from "@nestjs/common";
import { ApiClient } from "core/api-client.js";

const __uuid = randomUUID();

/**
 * @internal
 */
export const __apis = new Map<ApiName, { injectionToken: string | symbol }>();

export type ApiName = string | symbol;

export function createApiInjectionToken(name: ApiName) {
  return typeof name === "string" ? `$$ApiClient(${name}):${__uuid}` : name;
}

export function Api(name: ApiName): ParameterDecorator {
  return function decorator(target, propertyKey, parameterIndex) {
    const parameterTypes = Reflect.getMetadata("design:paramtypes", target);
    const paramType = parameterTypes[parameterIndex];

    if (paramType !== ApiClient) {
      throw new RuntimeException("Api client is not an instance of HttpService");
    }

    const injectionToken = createApiInjectionToken(name);
    __apis.set(name, { injectionToken });
    Inject(injectionToken)(target, propertyKey, parameterIndex);
  };
}
