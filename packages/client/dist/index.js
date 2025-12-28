import c from "papaparse";
class l extends Error {
  constructor(t) {
    super(t.error), this.name = "GagaraError", this.code = t.code, this.details = t.details;
  }
}
class u extends Error {
  constructor(t) {
    super(`HTTP Error: ${t.status} ${t.statusText}`), this.name = "GagaraHttpError", this.status = t.status, this.statusText = t.statusText;
  }
}
class d {
  constructor(t) {
    this.baseUrl = t.baseUrl.replace(/\/$/, ""), this.token = t.token;
  }
  async request(t, r = {}) {
    const s = `${this.baseUrl}${t}`, o = new Headers(r.headers);
    o.set("Authorization", `Bearer ${this.token}`);
    const e = await fetch(s, {
      ...r,
      headers: o
    });
    if (!e.ok) {
      let a;
      try {
        a = await e.json();
      } catch {
        throw new u(e);
      }
      throw new l(a);
    }
    return e.headers.get("content-type")?.includes("application/json") ? e.json() : e.text();
  }
  async query(t, r = {}) {
    const s = r.format || "json", o = `/query?format=${s}`, e = await this.request(o, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sql: t })
    });
    if (s === "csv") {
      const i = e, a = c.parse(i, {
        header: !0,
        skipEmptyLines: !0,
        dynamicTyping: !0
      });
      if (a.errors.length > 0)
        throw new Error(`Failed to parse CSV: ${a.errors[0].message}`);
      return a.data;
    }
    return e.data;
  }
  async getCatalog() {
    return (await this.request("/catalog")).tables;
  }
  async refreshCatalog() {
    return (await this.request("/refresh-catalog", {
      method: "POST"
    })).tables;
  }
  async addCatalogTable(t, r) {
    return (await this.request("/catalog/tables", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: t, path: r })
    })).tables;
  }
  async deleteCatalogTable(t) {
    return (await this.request("/catalog/tables", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: t })
    })).tables;
  }
}
export {
  d as GagaraClient,
  l as GagaraError,
  u as GagaraHttpError
};
