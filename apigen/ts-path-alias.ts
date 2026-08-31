import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve as resolvePath } from "node:path";
import { modify, applyEdits } from "jsonc-parser";
import { toKebabCase } from "./naming.js";

export interface ApplyTsPathAliasOptions {
  /** PascalCase base name the client was generated for, e.g. "PetStore". */
  name: string;
  /** The `--out` file the client was written to. */
  outFile: string;
  /** `--tspathalias` CLI value: `true` (or the literal string `"true"`) to autogenerate, or an explicit alias string. */
  tspathalias: string | boolean;
  /** `--tsconfigpath` CLI value, defaults to "tsconfig.json" in the current working directory. */
  tsconfigPath?: string;
}

/** "PetStore" -> "@pet-store/apigen", the default alias when `--tspathalias` is passed without a value. */
export function defaultTsPathAlias(name: string): string {
  return `@${toKebabCase(name)}/apigen`;
}

/** Resolves the alias string a `--tspathalias` CLI value should produce. */
export function resolveTsPathAlias(tspathalias: string | boolean, name: string): string {
  if (typeof tspathalias === "string" && tspathalias !== "true") {
    return tspathalias;
  }
  return defaultTsPathAlias(name);
}

function aliasMappingFilePath(tsconfigPath: string): string {
  return resolvePath(dirname(tsconfigPath), "node_modules", ".cache", "apigen-path-aliases.json");
}

async function readAliasMapping(mappingFile: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(mappingFile, "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function toTsPathsValue(tsconfigPath: string, outFile: string): string {
  const relativePath = relative(dirname(tsconfigPath), resolvePath(outFile)).split("\\").join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

/**
 * Adds (or updates) a `compilerOptions.paths` entry in `tsconfig.json` pointing
 * an alias at the freshly generated client file. Edits are applied with
 * `jsonc-parser` so existing formatting/comments in the tsconfig survive, and
 * only the touched entries change.
 *
 * A mapping of api name -> alias is kept alongside `node_modules` so that
 * re-running apigen with a different `--tspathalias` for the same `--name`
 * replaces the previous entry instead of accumulating stale ones.
 */
export async function applyTsPathAlias(options: ApplyTsPathAliasOptions): Promise<void> {
  const tsconfigPath = resolvePath(options.tsconfigPath ?? "tsconfig.json");
  const alias = resolveTsPathAlias(options.tspathalias, options.name);

  let tsconfigSource: string;
  try {
    tsconfigSource = await readFile(tsconfigPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `--tspathalias was given but no tsconfig was found at "${tsconfigPath}". Pass --tsconfigpath to point at an existing tsconfig.json.`,
      );
    }
    throw error;
  }

  const mappingFile = aliasMappingFilePath(tsconfigPath);
  const mapping = await readAliasMapping(mappingFile);
  const previousAlias = mapping[options.name];

  const formattingOptions = { tabSize: 2, insertSpaces: true, eol: "\n" };
  let edited = tsconfigSource;
  if (previousAlias !== undefined && previousAlias !== alias) {
    edited = applyEdits(
      edited,
      modify(edited, ["compilerOptions", "paths", previousAlias], undefined, { formattingOptions }),
    );
  }
  edited = applyEdits(
    edited,
    modify(
      edited,
      ["compilerOptions", "paths", alias],
      [toTsPathsValue(tsconfigPath, options.outFile)],
      {
        formattingOptions,
      },
    ),
  );

  await writeFile(tsconfigPath, edited, "utf8");

  mapping[options.name] = alias;
  await mkdir(dirname(mappingFile), { recursive: true });
  await writeFile(mappingFile, JSON.stringify(mapping, null, 2), "utf8");
}
