import path from "node:path"
import { config } from "dotenv"
import { cleanupCatalogFixtures, ensureLocalFixtures, ensureS3Fixtures, refreshServerCatalog } from "./fixtures"

export default async function globalSetup() {
  config({ path: path.join(process.cwd(), ".env") })
  config({ path: path.join(process.cwd(), "packages", "ui", ".env") })
  await ensureLocalFixtures()
  await ensureS3Fixtures()
  await refreshServerCatalog()

  return async () => {
    await cleanupCatalogFixtures()
  }
}
