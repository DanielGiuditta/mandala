import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const sourceDir = resolve(rootDir, "apps/web/.next");
const targetDir = resolve(rootDir, ".next");

if (!existsSync(sourceDir)) {
  throw new Error(`Expected Next.js output at ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
