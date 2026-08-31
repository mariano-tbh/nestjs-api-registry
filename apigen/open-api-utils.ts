import type { ReferenceObject } from "openapi-typescript";

export function isReferenceObject(object: object): object is ReferenceObject {
  return "$ref" in object && typeof object.$ref === "string";
}
