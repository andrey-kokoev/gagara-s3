import path from "node:path"
import fs from "node:fs/promises"
import { Readable } from "node:stream"
import { config } from "dotenv"
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const rootEnv = path.join(process.cwd(), ".env")
const uiEnv = path.join(process.cwd(), "packages", "ui", ".env")

config({ path: rootEnv })
config({ path: uiEnv })

type FixtureTable = {
  name: string
  key: string
  csv: string
}

const fixtureTables: FixtureTable[] = [
  {
    name: "table_1",
    key: "fixtures/table_1/data.csv",
    csv: "id,name\n1,alpha\n2,beta\n3,gamma\n"
  },
  {
    name: "table_2",
    key: "fixtures/table_2/data.csv",
    csv: "id,category\n10,blue\n11,green\n12,red\n"
  }
]

async function ensureLocalFixtures() {
  const fixturesRoot = path.join(process.cwd(), "fixtures")
  for (const table of fixtureTables) {
    const dir = path.join(fixturesRoot, table.name)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, "data.csv")
    await fs.writeFile(filePath, table.csv, "utf-8")
  }
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} for integration tests`)
  }
  return value
}

function resolveDataKey(key: string) {
  const dir = (process.env.GAGARA_S3_DIR || "").trim().replace(/\/+$/, "")
  if (!dir) {
    return key
  }
  return `${dir}/${key.replace(/^\/+/, "")}`
}

function resolveCatalogKey(defaultCatalog: string) {
  const dir = (process.env.GAGARA_S3_DIR || "").trim().replace(/\/+$/, "")
  if (!dir) {
    return defaultCatalog
  }
  return `${dir}/${defaultCatalog.replace(/^\/+/, "")}`
}

function streamToString(stream: unknown): Promise<string> {
  if (!(stream instanceof Readable)) {
    return Promise.resolve("")
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")))
  })
}

async function ensureS3Fixtures() {
  const bucket = requireEnv("GAGARA_S3_BUCKET")
  const region = process.env.GAGARA_S3_REGION || "auto"
  const endpoint = process.env.GAGARA_S3_ENDPOINT_URL || undefined
  const accessKeyId = requireEnv("GAGARA_S3_ACCESS_KEY_ID")
  const secretAccessKey = requireEnv("GAGARA_S3_SECRET_ACCESS_KEY")
  const catalogKey = resolveCatalogKey(requireEnv("GAGARA_S3_DEFAULT_CATALOG"))

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey }
  })

  for (const table of fixtureTables) {
    const objectKey = resolveDataKey(table.key)
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }))
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode
      if (err?.name !== "NotFound" && status !== 404) {
        throw err
      }
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: table.csv,
          ContentType: "text/csv"
        })
      )
    }
  }

  const catalog: { tables: Record<string, string> } = { tables: {} }

  for (const table of fixtureTables) {
    const objectKey = resolveDataKey(table.key)
    catalog.tables[table.name] = `s3://${bucket}/${objectKey}`
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: catalogKey,
      Body: JSON.stringify(catalog, null, 2),
      ContentType: "application/json"
    })
  )
}

async function refreshServerCatalog() {
  const baseUrl = requireEnv("GAGARA_S3_SERVER_URL").replace(/\/$/, "")
  const token = requireEnv("GAGARA_S3_SERVICE_TOKEN")

  const res = await fetch(`${baseUrl}/refresh-catalog`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  if (!res.ok) {
    throw new Error(`Failed to refresh catalog: ${res.status}`)
  }
}

await ensureLocalFixtures()
await ensureS3Fixtures()
await refreshServerCatalog()
