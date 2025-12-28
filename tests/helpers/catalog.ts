type CatalogResponse = {
  tables?: Record<string, string>
}

export function pickFixtureTable(catalog: CatalogResponse) {
  const tables = Object.keys(catalog.tables || {})
  const preferred = tables.find((name) => name === "table_1" || name === "table_2")
  return preferred ?? tables[0] ?? ""
}
