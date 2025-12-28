import path from "node:path"
import fs from "node:fs/promises"
import { Readable } from "node:stream"
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

type FixtureTable = {
  name: string
  key: string
  csv: string
}

export const fixtureTables: FixtureTable[] = [
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

export async function ensureLocalFixtures() {
  const fixturesRoot = path.join(process.cwd(), "fixtures")
  for (const table of fixtureTables) {
    const dir = path.join(fixturesRoot, table.name)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, "data.csv")
    await fs.writeFile(filePath, table.csv, "utf-8")
  }
}

export function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} for integration tests`)
  }
  return value
}

export function resolveDataKey(key: string) {
  return key.replace(/^\/+/, "")
}

export function resolveCatalogKey(defaultCatalog: string) {
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

function createS3Client() {
  const region = process.env.GAGARA_S3_REGION || "auto"
  const endpoint = process.env.GAGARA_S3_ENDPOINT_URL || undefined
  const accessKeyId = requireEnv("GAGARA_S3_ACCESS_KEY_ID")
  const secretAccessKey = requireEnv("GAGARA_S3_SECRET_ACCESS_KEY")

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey }
  })
}

export async function ensureS3Fixtures() {
  const bucket = requireEnv("GAGARA_S3_BUCKET")
  const catalogKey = resolveCatalogKey(requireEnv("GAGARA_S3_DEFAULT_CATALOG"))
  const client = createS3Client()

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

  let catalog: { tables: Record<string, string> } | null = null
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: catalogKey
      })
    )
    const payload = await streamToString(response.Body)
    const parsed = JSON.parse(payload)
    if (parsed && typeof parsed === "object" && parsed.tables && typeof parsed.tables === "object") {
      catalog = { tables: parsed.tables }
    }
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode
    if (err?.name !== "NoSuchKey" && err?.name !== "NotFound" && status !== 404) {
      throw err
    }
  }

  const resolvedCatalog = catalog ?? { tables: {} }
  let updated = false

  for (const table of fixtureTables) {
    if (resolvedCatalog.tables[table.name]) {
      continue
    }
    const objectKey = resolveDataKey(table.key)
    resolvedCatalog.tables[table.name] = `s3://${bucket}/${objectKey}`
    updated = true
  }

  if (!catalog || updated) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: catalogKey,
        Body: JSON.stringify(resolvedCatalog, null, 2),
        ContentType: "application/json"
      })
    )
  }
}

export async function refreshServerCatalog() {
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

export async function cleanupCatalogFixtures() {
  const bucket = requireEnv("GAGARA_S3_BUCKET")
  const catalogKey = resolveCatalogKey(requireEnv("GAGARA_S3_DEFAULT_CATALOG"))
  const client = createS3Client()

  let catalog: { tables: Record<string, string> } | null = null
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: catalogKey
      })
    )
    const payload = await streamToString(response.Body)
    const parsed = JSON.parse(payload)
    if (parsed && typeof parsed === "object" && parsed.tables && typeof parsed.tables === "object") {
      catalog = { tables: parsed.tables }
    }
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode
    if (err?.name !== "NoSuchKey" && err?.name !== "NotFound" && status !== 404) {
      throw err
    }
  }

  if (!catalog) {
    return
  }

  let removed = false
  for (const table of fixtureTables) {
    if (table.name in catalog.tables) {
      delete catalog.tables[table.name]
      removed = true
    }
  }

  if (!removed) {
    return
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: catalogKey,
      Body: JSON.stringify(catalog, null, 2),
      ContentType: "application/json"
    })
  )

  await refreshServerCatalog()
}
