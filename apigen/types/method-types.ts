import type { AxiosRequestConfig } from "axios";

/**
 * Shape a generated `<Name>Api` interface entry must follow for one
 * operation. Codegen always sets all five fields explicitly -- `params` is
 * `Record<string, never>` and `query`/`header`/`body` are `never` when the
 * operation has none of them -- so `MethodDefinition` can tell "not present"
 * apart from "present but empty".
 */
export interface ApiOperation {
  /** Path params, flattened directly onto the method's args object. */
  params: Record<string, unknown>;
  query: unknown;
  header: unknown;
  body: unknown;
  response: unknown;
}

// `[T] extends [never]` (rather than a bare `T extends never`) avoids TS's
// distributive-conditional-type behavior, which would otherwise collapse the
// whole conditional to `never` instead of picking the false branch when T is
// instantiated with `never`.
type OptionalField<Key extends string, T> = [T] extends [never] ? unknown : { [K in Key]: T };

export type MethodDefinition<T extends ApiOperation> = (
  args: T["params"] &
    OptionalField<"query", T["query"]> &
    OptionalField<"header", T["header"]> &
    OptionalField<"body", T["body"]>,
  config?: AxiosRequestConfig,
) => Promise<T["response"]>;

export type MethodResponse<T extends ApiOperation> = T["response"];
