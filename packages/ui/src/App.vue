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
          <li v-for="table in catalogEntries" :key="table.name" class="catalog-row">
            <button class="catalog-item" type="button" @click="appendTable(table.name)">
              <span>{{ table.name }}</span>
              <span class="path" :title="table.path">{{ table.path }}</span>
            </button>
            <button
              class="icon-button"
              type="button"
              @click="editTable(table)"
              :disabled="addingTable"
              aria-label="Edit table"
              title="Edit table"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M3 17.25V21h3.75L19.81 7.94l-3.75-3.75L3 17.25zm17.71-10.04c.39-.39.39-1.02 0-1.41L18.2 3.29a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 2-2z"
                />
              </svg>
            </button>
            <button
              class="icon-button danger"
              type="button"
              @click="deleteTable(table.name)"
              :disabled="addingTable"
              aria-label="Delete table"
              title="Delete table"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
                />
              </svg>
            </button>
          </li>
        </ul>
        <p v-if="!catalogLoading && catalogEntries.length === 0" class="muted">No tables available.</p>

        <div class="catalog-add">
          <h3>{{ editingTableName ? "Edit table" : "Add table" }}</h3>
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
          <p class="hint">Relative to the configured bucket.</p>
          <div class="catalog-actions">
            <button
              class="primary"
              data-testid="save-table"
              @click="saveTable"
              :disabled="addingTable || !clientReady"
            >
              {{ addingTable ? "Saving..." : editingTableName ? "Save changes" : "Save table" }}
            </button>
            <button class="ghost" @click="clearTableForm" :disabled="addingTable">
              {{ editingTableName ? "Cancel" : "Clear" }}
            </button>
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
                class="primary muted"
                data-testid="run-query"
                @click="runQuery"
                :disabled="loading || !clientReady"
              >
                <span>{{ loading ? "Running..." : "Run query" }}</span>
                <span v-if="!loading" class="shortcut">Ctrl+Enter</span>
              </button>
            </div>
          </div>

          <div class="editor-shell">
            <textarea
              v-model="sql"
              class="editor-input"
              spellcheck="false"
              placeholder="SELECT * FROM users LIMIT 50"
              @keydown.ctrl.enter.prevent="runQuery"
              :disabled="loading"
            ></textarea>
            <pre class="editor-preview" v-html="highlightedSql"></pre>
            <div v-if="loading" class="editor-blocker" aria-hidden="true">
              <span class="spinner" aria-hidden="true"></span>
            </div>
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
          <div v-else-if="loading" class="muted loading-row">
            <span>Query running...</span>
            <button class="ghost" type="button" @click="cancelQuery">Cancel</button>
          </div>
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
const activeQuery = ref<AbortController | null>(null)

const catalogEntries = ref<Array<{ name: string; path: string }>>([])
const catalogLoading = ref(false)
const catalogError = ref("")
const newTableName = ref("")
const newTablePath = ref("")
const tableError = ref("")
const addingTable = ref(false)
const editingTableName = ref<string | null>(null)

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

async function saveTable() {
  const activeClient = client.value
  if (!activeClient) {
    tableError.value = "Missing server URL or service token."
    return
  }

  const nextName = newTableName.value.trim()
  const nextPath = newTablePath.value.trim()
  if (!nextName || !nextPath) {
    tableError.value = "Table name and path are required."
    return
  }

  tableError.value = ""
  addingTable.value = true

  try {
    let tables: Record<string, string>
    if (editingTableName.value && editingTableName.value !== nextName) {
      await activeClient.deleteCatalogTable(editingTableName.value)
      tables = await activeClient.addCatalogTable(nextName, nextPath)
    } else {
      tables = await activeClient.addCatalogTable(nextName, nextPath)
    }
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

async function deleteTable(name: string) {
  const activeClient = client.value
  if (!activeClient) {
    tableError.value = "Missing server URL or service token."
    return
  }

  tableError.value = ""
  addingTable.value = true

  try {
    const tables = await activeClient.deleteCatalogTable(name)
    catalogEntries.value = Object.entries(tables).map(([tableName, path]) => ({
      name: tableName,
      path,
    }))
  } catch (err) {
    tableError.value = (err as Error).message || "Failed to delete table"
  } finally {
    addingTable.value = false
  }
}

function editTable(table: { name: string; path: string }) {
  newTableName.value = table.name
  newTablePath.value = normalizePathForEdit(table.path)
  editingTableName.value = table.name
  tableError.value = ""
}

function normalizePathForEdit(path: string) {
  const trimmed = path.trim()
  if (trimmed.startsWith("s3://")) {
    return trimmed.replace(/^s3:\/\/[^/]+\/?/, "")
  }
  return trimmed.replace(/^\/+/, "")
}

function clearTableForm() {
  newTableName.value = ""
  newTablePath.value = ""
  tableError.value = ""
  editingTableName.value = null
}

async function runQuery() {
  const activeClient = client.value
  if (!activeClient) {
    error.value = "Missing server URL or service token."
    return
  }

  if (loading.value) {
    return
  }

  error.value = ""
  loading.value = true
  const controller = new AbortController()
  activeQuery.value = controller

  try {
    const data = await activeClient.query(sql.value, {
      format: format.value,
      signal: controller.signal,
    })
    if (controller.signal.aborted || activeQuery.value !== controller) {
      return
    }
    rows.value = data
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      if (activeQuery.value === controller) {
        error.value = "Query cancelled."
      }
      return
    }
    error.value = (err as Error).message || "Query failed"
  } finally {
    if (activeQuery.value === controller) {
      loading.value = false
      activeQuery.value = null
    }
  }
}

function cancelQuery() {
  if (!activeQuery.value) {
    return
  }
  activeQuery.value.abort()
  activeQuery.value = null
  loading.value = false
  error.value = "Query cancelled."
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
  background: radial-gradient(circle at top, #1a2025, var(--ui-bg) 55%, #07090b 100%);
  color: var(--ui-text);
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
  color: var(--ui-text-muted);
  margin-bottom: 8px;
}

h1 {
  font-size: 40px;
  margin: 0 0 8px;
}

.subtitle {
  margin: 0;
  color: var(--ui-text-muted);
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
  color: var(--ui-text-muted);
}

.pill {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--ui-surface-muted);
  border: 1px solid var(--ui-border);
}

.pill.ok {
  background: color-mix(in srgb, var(--ui-success) 25%, var(--ui-surface) 75%);
  border-color: color-mix(in srgb, var(--ui-success) 50%, var(--ui-border) 50%);
  color: var(--ui-text);
}

.pill.warn {
  background: color-mix(in srgb, var(--ui-warning) 20%, var(--ui-surface) 80%);
  border-color: color-mix(in srgb, var(--ui-warning) 50%, var(--ui-border) 50%);
  color: var(--ui-text);
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
  color: var(--ui-text-muted);
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
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  font-size: 12px;
}

.ghost.danger {
  border-color: color-mix(in srgb, var(--ui-error) 50%, var(--ui-border) 50%);
  color: var(--ui-error);
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
  background: color-mix(in srgb, var(--ui-surface) 88%, #000 12%);
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--ui-border) 80%, #000 20%);
  padding: 20px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
  min-width: 0;
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
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  font-family: "IBM Plex Mono", monospace;
}

.primary {
  padding: 10px 16px;
  border-radius: 12px;
  border: none;
  background: var(--ui-primary);
  color: var(--ui-text-on-primary);
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary.muted {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
}

.primary.muted .shortcut {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-muted);
}

.ghost {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
}

.editor-shell {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface);
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
  caret-color: var(--ui-text);
  border: none;
  resize: none;
}

.editor-input:focus {
  outline: none;
}

.editor-input:disabled {
  cursor: not-allowed;
}

.editor-preview {
  margin: 0;
  padding: 16px;
  font-family: "IBM Plex Mono", monospace;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ui-text);
  white-space: pre-wrap;
  pointer-events: none;
}

.editor-blocker {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  pointer-events: none;
}

.spinner {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 3px solid color-mix(in srgb, var(--ui-border) 70%, transparent 30%);
  border-top-color: var(--ui-primary);
  animation: spin 0.9s linear infinite;
}

:deep(.hljs-keyword) {
  color: var(--ui-info);
  font-weight: 600;
}

:deep(.hljs-string) {
  color: var(--ui-secondary);
}

:deep(.hljs-number) {
  color: var(--ui-primary);
}

.hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.catalog-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.catalog-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.icon-button {
  width: 36px;
  min-width: 36px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-button svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.icon-button.danger {
  border-color: color-mix(in srgb, var(--ui-error) 50%, var(--ui-border) 50%);
  color: var(--ui-error);
}

.catalog-item {
  width: 100%;
  text-align: left;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface-muted);
  padding: 10px;
  cursor: pointer;
  color: var(--ui-text);
  overflow: hidden;
}

.catalog-item span {
  display: block;
}

.catalog-item .path {
  font-size: 11px;
  color: var(--ui-text-muted);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.catalog-add {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--ui-border);
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
  color: var(--ui-text-muted);
}

.catalog-add input {
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
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
  color: var(--ui-text-muted);
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
  overflow-y: auto;
  max-height: 420px;
  max-width: 100%;
}

.results .table-wrap::after {
  content: "Scroll horizontally to see more columns";
  display: block;
  font-size: 11px;
  color: var(--ui-text-muted);
  padding: 6px 2px 0;
}

@media (min-width: 900px) {
  .results .table-wrap::after {
    content: "";
    padding: 0;
  }
}

.loading-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  border-bottom: 1px solid #d4ded7;
  padding: 8px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

th {
  font-size: 12px;
  color: var(--ui-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.muted {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.error {
  color: var(--ui-error);
  background: color-mix(in srgb, var(--ui-error) 18%, var(--ui-surface) 82%);
  padding: 10px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--ui-error) 40%, var(--ui-border) 60%);
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

@keyframes spin {
  to {
    transform: rotate(360deg);
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
