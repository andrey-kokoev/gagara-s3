import i from "papaparse";
class u extends Error {
  constructor(t) {
    super(t.error), this.name = "GagaraError", this.code = t.code, this.details = t.details;
  }
}
class h extends Error {
  constructor(t) {
    super(`HTTP Error: ${t.status} ${t.statusText}`), this.name = "GagaraHttpError", this.status = t.status, this.statusText = t.statusText;
  }
}
class d {
  constructor(t) {
    this.baseUrl = t.baseUrl.replace(/\/$/, ""), this.token = t.token;
  }
  async request(t, a = {}) {
    const s = `${this.baseUrl}${t}`, o = new Headers(a.headers);
    o.set("Authorization", `Bearer ${this.token}`);
    const r = await fetch(s, {
      ...a,
      headers: o
    });
    if (!r.ok) {
      let e;
      try {
        e = await r.json();
      } catch {
        throw new h(r);
      }
      throw new u(e);
    }
    return r.headers.get("content-type")?.includes("application/json") ? r.json() : r.text();
  }
  async query(t, a = {}) {
    const s = a.format || "json", o = `/query?format=${s}`, r = await this.request(o, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sql: t })
    });
    if (s === "csv") {
      const c = r, e = i.parse(c, {
        header: !0,
        skipEmptyLines: !0,
        dynamicTyping: !0
      });
      if (e.errors.length > 0)
        throw new Error(`Failed to parse CSV: ${e.errors[0].message}`);
      return e.data;
    }
    return r.data;
  }
  async getCatalog() {
    return (await this.request("/catalog")).tables;
  }
  async refreshCatalog() {
    return (await this.request("/refresh-catalog", {
      method: "POST"
    })).tables;
  }
}
export {
  d as GagaraClient,
  u as GagaraError,
  h as GagaraHttpError
};
