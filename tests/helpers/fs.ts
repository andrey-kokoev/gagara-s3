import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(__dirname, "..", "..")

export function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8")
}

export function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T
}

export function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relativePath))
}
