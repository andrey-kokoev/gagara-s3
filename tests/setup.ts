import path from "node:path"
import { config } from "dotenv"

const rootEnv = path.join(process.cwd(), ".env")
const uiEnv = path.join(process.cwd(), "packages", "ui", ".env")

config({ path: rootEnv })
config({ path: uiEnv })
