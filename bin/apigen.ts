#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { generateApiClient } from "../apigen/index.js";

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
    .strict()
    .help()
    .parseAsync();

  await generateApiClient({ spec: argv.spec, name: argv.name, mode: argv.mode, outFile: argv.out });
  console.log(`Generated ${argv.name}Client (${argv.mode} mode) -> ${argv.out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
