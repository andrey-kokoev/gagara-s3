<template>
  <div class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">SQL over S3</p>
        <h1>gagara-s3 console</h1>
        <p class="subtitle">Run read-only DuckDB queries against S3 tables via the client SDK.</p>
      </div>
      <div class="status">
        <span class="pill" :class="{ ok: clientReady, warn: !clientReady }">
          {{ clientReady ? "Client ready" : "Missing env config" }}
        </span>
        <p class="status-meta">API: {{ baseUrl || "unset" }}</p>
        <div class="token-input">
          <label for="service-token">Service token</label>
          <div class="token-row">
            <input
              id="service-token"
              v-model="tokenInput"
              type="password"
              placeholder="Paste GAGARA_S3_SERVICE_TOKEN"
              autocomplete="off"
            />
            <button class="ghost" @click="saveToken">Save</button>
            <button class="ghost danger" @click="clearToken" :disabled="!tokenInput">Clear</button>
          </div>
          <p class="status-meta">Token: {{ tokenSource }}</p>
        </div>
      </div>
    </header>

    <main class="grid">
      <aside class="panel catalog">
        <div class="panel-header">
          <h2>Catalog</h2>
          <button class="ghost" @click="loadCatalog" :disabled="catalogLoading">
            {{ catalogLoading ? "Refreshing..." : "Refresh" }}
          </button>
        </div>

        <div v-if="catalogLoading" class="muted">Loading catalog...</div>
        <div v-else-if="catalogError" class="error">{{ catalogError }}</div>
        <ul v-else class="catalog-list">
          <li v-for="table in catalogEntries" :key="table.name">
            <button class="catalog-item" @click="appendTable(table.name)">
              <span>{{ table.name }}</span>
              <span class="path">{{ table.path }}</span>
            </button>
          </li>
        </ul>
        <p v-if="!catalogLoading && catalogEntries.length === 0" class="muted">No tables available.</p>

        <div class="catalog-add">
          <h3>Add table</h3>
          <label>
            Name
            <input v-model="newTableName" type="text" placeholder="table_name" />
          </label>
          <label>
            Path
            <div class="path-input">
              <span class="path-prefix">/</span>
              <input v-model="newTablePath" type="text" placeholder="path/to/file.csv" />
            </div>
          </label>
          <p class="hint">Relative to the configured bucket (and GAGARA_S3_DIR if set).</p>
          <div class="catalog-actions">
            <button
              class="primary"
              data-testid="save-table"
              @click="addTable"
              :disabled="addingTable || !clientReady"
            >
              {{ addingTable ? "Saving..." : "Save table" }}
            </button>
            <button class="ghost" @click="clearTableForm" :disabled="addingTable">Clear</button>
          </div>
          <p v-if="tableError" class="error">{{ tableError }}</p>
        </div>
      </aside>

      <section class="stack">
        <div class="panel editor">
          <div class="panel-header">
            <h2>Query</h2>
            <div class="controls">
              <select v-model="format" class="select">
                <option value="json">json</option>
                <option value="csv">csv</option>
              </select>
              <button
                class="primary"
                data-testid="run-query"
                @click="runQuery"
                :disabled="loading || !clientReady"
              >
                {{ loading ? "Running..." : "Run query" }}
              </button>
            </div>
          </div>

          <div class="editor-shell">
            <textarea
              v-model="sql"
              class="editor-input"
              spellcheck="false"
              placeholder="SELECT * FROM users LIMIT 50"
            ></textarea>
            <pre class="editor-preview" v-html="highlightedSql"></pre>
          </div>
          <p class="hint">Tip: Click a catalog table to insert its name.</p>
        </div>

        <div class="panel results">
          <div class="panel-header">
            <h2>Results</h2>
            <div class="controls">
              <button class="ghost" @click="downloadCsv" :disabled="!rows.length">
                Download CSV
              </button>
            </div>
          </div>

          <div v-if="error" class="error">{{ error }}</div>
          <div v-else-if="loading" class="muted">Query running...</div>
          <div v-else-if="rows.length === 0" class="muted">No results yet.</div>
          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th v-for="column in columns" :key="column">{{ column }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in rows" :key="index">
                  <td v-for="column in columns" :key="column">
                    {{ row[column] }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { GagaraClient } from "@gagara-s3/client"
import hljs from "highlight.js/lib/core"
import sqlLang from "highlight.js/lib/languages/sql"

hljs.registerLanguage("sql", sqlLang)

const baseUrl =
  import.meta.env.GAGARA_S3_SERVER_URL || import.meta.env.VITE_GAGARA_SERVER_URL || ""
const envToken =
  import.meta.env.GAGARA_S3_SERVICE_TOKEN ||
  import.meta.env.VITE_GAGARA_SERVICE_TOKEN ||
  ""
const tokenStorageKey = "gagara_s3_service_token"
const tokenInput = ref("")
const token = computed(() => tokenInput.value || envToken)
const tokenSource = computed(() => {
  if (tokenInput.value) {
    return "local"
  }
  return envToken ? "env" : "missing"
})

const client = computed(() =>
  baseUrl && token.value ? new GagaraClient({ baseUrl, token: token.value }) : null
)
const clientReady = computed(() => Boolean(client.value))

const sql = ref("SELECT * FROM users LIMIT 50")
const format = ref<"json" | "csv">("json")
const rows = ref<Array<Record<string, unknown>>>([])
const error = ref("")
const loading = ref(false)

const catalogEntries = ref<Array<{ name: string; path: string }>>([])
const catalogLoading = ref(false)
const catalogError = ref("")
const newTableName = ref("")
const newTablePath = ref("")
const tableError = ref("")
const addingTable = ref(false)

const columns = computed(() => {
  if (rows.value.length === 0) {
    return []
  }
  return Object.keys(rows.value[0])
})

const highlightedSql = computed(() => {
  if (!sql.value) {
    return ""
  }
  return hljs.highlight(sql.value, { language: "sql" }).value
})

async function loadCatalog() {
  const activeClient = client.value
  if (!activeClient) {
    catalogError.value = "Missing server URL or service token."
    return
  }

  catalogLoading.value = true
  catalogError.value = ""

  try {
    const tables = await activeClient.getCatalog()
    catalogEntries.value = Object.entries(tables).map(([name, path]) => ({
      name,
      path,
    }))
  } catch (err) {
    catalogError.value = (err as Error).message || "Failed to load catalog"
  } finally {
    catalogLoading.value = false
  }
}

async function addTable() {
  const activeClient = client.value
  if (!activeClient) {
    tableError.value = "Missing server URL or service token."
    return
  }

  tableError.value = ""
  addingTable.value = true

  try {
    const tables = await activeClient.addCatalogTable(
      newTableName.value.trim(),
      newTablePath.value.trim()
    )
    catalogEntries.value = Object.entries(tables).map(([name, path]) => ({
      name,
      path,
    }))
    clearTableForm()
  } catch (err) {
    tableError.value = (err as Error).message || "Failed to add table"
  } finally {
    addingTable.value = false
  }
}

function clearTableForm() {
  newTableName.value = ""
  newTablePath.value = ""
  tableError.value = ""
}

async function runQuery() {
  const activeClient = client.value
  if (!activeClient) {
    error.value = "Missing server URL or service token."
    return
  }

  error.value = ""
  loading.value = true

  try {
    const data = await activeClient.query(sql.value, { format: format.value })
    rows.value = data
  } catch (err) {
    error.value = (err as Error).message || "Query failed"
  } finally {
    loading.value = false
  }
}

function appendTable(name: string) {
  sql.value = `${sql.value}\n${name}`
}

function downloadCsv() {
  if (rows.value.length === 0) {
    return
  }
  const headers = columns.value
  const csvLines = [headers.join(",")]
  rows.value.forEach((row) => {
    csvLines.push(headers.map((header) => escapeCsv(row[header])).join(","))
  })
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "gagara-results.csv"
  link.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`
  }
  return text
}

onMounted(() => {
  try {
    const stored = localStorage.getItem(tokenStorageKey)
    if (stored) {
      tokenInput.value = stored
    }
  } catch {
    tokenInput.value = ""
  }
  loadCatalog()
})

function saveToken() {
  try {
    if (tokenInput.value) {
      localStorage.setItem(tokenStorageKey, tokenInput.value)
    } else {
      localStorage.removeItem(tokenStorageKey)
    }
  } catch {
    return
  }
}

function clearToken() {
  tokenInput.value = ""
  try {
    localStorage.removeItem(tokenStorageKey)
  } catch {
    return
  }
}
</script>

<style scoped>
:global(body) {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  background: radial-gradient(circle at top, #f1f0e6, #d9e0d8 50%, #b2c2c0 100%);
  color: #10211c;
  min-height: 100vh;
}

:global(*) {
  box-sizing: border-box;
}

.page {
  padding: 32px 40px 64px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
  animation: fadeIn 0.6s ease-in;
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 12px;
  color: #42655c;
  margin-bottom: 8px;
}

h1 {
  font-size: 40px;
  margin: 0 0 8px;
}

.subtitle {
  margin: 0;
  color: #36524a;
}

.status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.status-meta {
  margin: 0;
  font-size: 12px;
  color: #42655c;
}

.pill {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #f3efe1;
  border: 1px solid #c8d3cc;
}

.pill.ok {
  background: #d4f1d7;
  border-color: #78c58a;
}

.pill.warn {
  background: #ffe3c0;
  border-color: #f2b268;
}

.token-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.token-input label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: #42655c;
}

.token-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.token-row input {
  width: 220px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #c3d0c6;
  background: #fefcf7;
  font-size: 12px;
}

.ghost.danger {
  border-color: #f2b8aa;
  color: #7a2515;
}

.grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.panel {
  background: rgba(255, 255, 255, 0.85);
  border-radius: 18px;
  border: 1px solid rgba(19, 41, 34, 0.1);
  padding: 20px;
  box-shadow: 0 12px 30px rgba(16, 33, 28, 0.12);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.select {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #c3d0c6;
  background: #fefcf7;
  font-family: "IBM Plex Mono", monospace;
}

.primary {
  padding: 10px 16px;
  border-radius: 12px;
  border: none;
  background: #162f27;
  color: #fefcf7;
  font-weight: 600;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ghost {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #b7c6bf;
  background: transparent;
  color: #22362f;
  cursor: pointer;
}

.editor-shell {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #c5d2c9;
  background: #fefcf7;
  min-height: 180px;
}

.editor-input {
  position: absolute;
  inset: 0;
  padding: 16px;
  font-family: "IBM Plex Mono", monospace;
  font-size: 14px;
  line-height: 1.6;
  color: transparent;
  background: transparent;
  caret-color: #132b23;
  border: none;
  resize: none;
}

.editor-input:focus {
  outline: none;
}

.editor-preview {
  margin: 0;
  padding: 16px;
  font-family: "IBM Plex Mono", monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #132b23;
  white-space: pre-wrap;
  pointer-events: none;
}

:deep(.hljs-keyword) {
  color: #0f4c5c;
  font-weight: 600;
}

:deep(.hljs-string) {
  color: #8f2d56;
}

:deep(.hljs-number) {
  color: #5a189a;
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: #5c746b;
}

.catalog-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.catalog-item {
  width: 100%;
  text-align: left;
  border: 1px solid #c6d2c9;
  border-radius: 12px;
  background: #fefcf7;
  padding: 10px;
  cursor: pointer;
}

.catalog-item span {
  display: block;
}

.catalog-item .path {
  font-size: 11px;
  color: #587069;
  margin-top: 4px;
}

.catalog-add {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #d4ded7;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.catalog-add h3 {
  margin: 0;
  font-size: 14px;
}

.catalog-add label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #3b5650;
}

.catalog-add input {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #c3d0c6;
  background: #fefcf7;
  font-size: 12px;
}

.path-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-prefix {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  color: #3b5650;
  padding: 6px 0;
}

.path-input input {
  flex: 1;
}

.catalog-actions {
  display: flex;
  gap: 10px;
}

.results .table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  border-bottom: 1px solid #d4ded7;
  padding: 8px;
  text-align: left;
}

th {
  font-size: 12px;
  color: #3b5650;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.muted {
  color: #5c746b;
  font-size: 13px;
}

.error {
  color: #9b2e1a;
  background: #ffe0d8;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid #f2b8aa;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 960px) {
  .page {
    padding: 24px;
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
