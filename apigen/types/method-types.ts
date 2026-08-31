import type { AxiosRequestConfig } from "axios";

/**
 * Shape a generated `<Name>Api` interface entry must follow for one operation.
 * Codegen always sets `params` (merged path/query/header params, `{}` if none)
 * and `body` explicitly (`never` if the operation takes no request body) so
 * that `MethodDefinition` can tell "no body" apart from "body is optional".
 */
export interface ApiOperation {
  params: Record<string, unknown>;
  body: unknown;
  response: unknown;
}

export type MethodDefinition<T extends ApiOperation> = (
  args: T["params"] & (T["body"] extends never ? unknown : { body: T["body"] }),
  config?: AxiosRequestConfig,
) => Promise<T["response"]>;

export type MethodResponse<T extends ApiOperation> = T["response"];
