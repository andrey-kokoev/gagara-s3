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
  const catalogKey = requireEnv("GAGARA_S3_DEFAULT_CATALOG")

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey }
  })

  for (const table of fixtureTables) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: table.key }))
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode
      if (err?.name !== "NotFound" && status !== 404) {
        throw err
      }
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: table.key,
          Body: table.csv,
          ContentType: "text/csv"
        })
      )
    }
  }

  let catalog: { tables: Record<string, string> } = { tables: {} }
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
      catalog.tables = parsed.tables
    }
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode
    if (err?.name !== "NoSuchKey" && err?.name !== "NotFound" && status !== 404) {
      throw err
    }
  }

  for (const table of fixtureTables) {
    catalog.tables[table.name] = `s3://${bucket}/${table.key}`
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

await ensureLocalFixtures()
await ensureS3Fixtures()
