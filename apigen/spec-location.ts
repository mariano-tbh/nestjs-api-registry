import { parse as parseYaml } from "yaml";

export function isUrl(location: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(location).protocol);
  } catch {
    return false;
  }
}

export function parseSpecText(text: string, location: string): unknown {
  if (location.endsWith(".yaml") || location.endsWith(".yml")) {
    return parseYaml(text);
  }
  if (location.endsWith(".json")) {
    return JSON.parse(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    return parseYaml(text);
  }
}
