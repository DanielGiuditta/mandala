// Module hooks that let `node --test` import this repo's TypeScript sources
// without a build step or extra dependencies:
// - transpiles .ts/.tsx with the TypeScript compiler already used by the web app
// - resolves extensionless relative imports (`./auth` -> `./auth.ts`)
// - maps @mandala/db and @mandala/domain to this checkout's packages
// - applies per-test aliases, so a test can swap a module for a fake
//
// Usage at the top of a test file, before importing the code under test:
//   register("<path>/test/support/typescript-hooks.mjs", import.meta.url, {
//     data: { aliases: { "next/cache": new URL("./fakes/next-cache.mjs", import.meta.url).href } },
//   });
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = new URL("../../", import.meta.url);
const workspacePackages = {
  "@mandala/db": new URL("packages/db/index.ts", repoRoot).href,
  "@mandala/domain": new URL("packages/domain/index.ts", repoRoot).href,
};
const typeScriptFile = /\.tsx?$/;
let aliases = {};

export async function initialize(data = {}) {
  aliases = data.aliases ?? {};
}

export async function resolve(specifier, context, nextResolve) {
  const target = aliases[specifier] ?? workspacePackages[specifier];

  if (target) {
    return { shortCircuit: true, url: target };
  }

  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");

  if (isRelative && context.parentURL && typeScriptFile.test(context.parentURL)) {
    for (const suffix of [".ts", ".tsx", "/index.ts"]) {
      const candidate = new URL(`${specifier}${suffix}`, context.parentURL);

      if (existsSync(fileURLToPath(candidate))) {
        return { shortCircuit: true, url: candidate.href };
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!typeScriptFile.test(url)) {
    return nextLoad(url, context);
  }

  const fileName = fileURLToPath(url);
  const { outputText } = ts.transpileModule(await readFile(fileName, "utf8"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  });

  return { format: "module", shortCircuit: true, source: outputText };
}
