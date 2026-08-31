# AGENTS.md

## TypeScript version is pinned to what openapi-typescript supports

`apigen` shells out to `openapi-typescript` (see `apigen/render.ts`) to
generate the schema types backing every generated client. That package
declares `peerDependencies.typescript: "^5.x"`, so this repo's own
`typescript` devDependency/peerDependency must stay on a 5.x release too —
codegen output isn't guaranteed correct against a TypeScript major
openapi-typescript hasn't signed off on.

`.github/dependabot.yml` ignores major-version updates to `typescript` for
this reason.

**When a new TypeScript major (6.x, ...) is released:** check
`openapi-typescript`'s `peerDependencies.typescript` range
(https://www.npmjs.com/package/openapi-typescript) before upgrading here.
Once it allows the new major:

1. Remove the `typescript` entry from `.github/dependabot.yml`'s `ignore`
   list (or narrow it to the next major once that one ships too).
2. Bump `typescript` in `package.json`'s `devDependencies` and
   `package-lock.json`.
3. Run `npm test` and `npm run build` — `apigen/generate.smoke.spec.ts`
   type-checks generated output against the real `typescript` compiler, so
   it's the canary for this.
