#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { generateApiClient } from "../apigen/index.js";
import { applyTsPathAlias } from "../apigen/ts-path-alias.js";

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("apigen")
    .usage("$0 --spec <url|path> --name <PascalCaseName> --mode <named|feature> --out <file.ts>")
    .option("spec", {
      type: "string",
      demandOption: true,
      describe: "URL or local path to an OpenAPI 3.x document (JSON or YAML)",
    })
    .option("name", {
      type: "string",
      demandOption: true,
      describe: "PascalCase base name, e.g. PetStore",
    })
    .option("mode", {
      choices: ["named", "feature"] as const,
      demandOption: true,
      describe: "named: @Api(TOKEN) injection. feature: ApiRegistryModule.forFeature-based module.",
    })
    .option("out", {
      type: "string",
      demandOption: true,
      describe: "Output .ts file path",
    })
    .option("tspathalias", {
      describe:
        'Add a tsconfig "paths" alias for --out. Pass with no value (or "true") to autogenerate one from --name (e.g. "@pet-store/apigen"), or pass an explicit alias, e.g. --tspathalias "@api/pet-store"',
    })
    .option("tsconfigpath", {
      type: "string",
      describe: 'tsconfig.json to update when --tspathalias is set (default: "tsconfig.json")',
    })
    .strict()
    .help()
    .parseAsync();

  await generateApiClient({ spec: argv.spec, name: argv.name, mode: argv.mode, outFile: argv.out });
  console.log(`Generated ${argv.name}Client (${argv.mode} mode) -> ${argv.out}`);

  if (argv.tspathalias !== undefined && argv.tspathalias !== false) {
    await applyTsPathAlias({
      name: argv.name,
      outFile: argv.out,
      tspathalias: argv.tspathalias as string | boolean,
      tsconfigPath: argv.tsconfigpath,
    });
    console.log(
      `Updated tsconfig path alias for ${argv.name}Client -> ${argv.tsconfigpath ?? "tsconfig.json"}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
