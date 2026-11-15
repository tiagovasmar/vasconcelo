import { describe, expect, it } from "vitest";
import { authDomainOptions, previewHosts } from "@/server/auth-domains";

const H = "codex-compras-importaciones--vasconcelo.netlify.app";

describe("vistas previas de Netlify en el inicio de sesión", () => {
  it("acepta solo nombres exactos de este sitio y descarta el resto", () => {
    expect(previewHosts(` ${H} , OTRA--vasconcelo.netlify.app `)).toEqual([H, "otra--vasconcelo.netlify.app"]);
    expect(previewHosts("*.netlify.app,evil.com,rama--otrositio.netlify.app,vasconcelo.shop,--vasconcelo.netlify.app,a.b--vasconcelo.netlify.app")).toEqual([]);
    expect(previewHosts("")).toEqual([]);
    expect(previewHosts(undefined)).toEqual([]);
  });
  it("sin la variable, la lista de dominios es la de siempre", () => {
    delete process.env.AUTH_PREVIEW_HOSTS;
    const o = authDomainOptions("https://vasconcelo.shop") as { baseURL: { allowedHosts: string[] }; trustedOrigins: string[] };
    expect(o.baseURL.allowedHosts).toEqual(["vasconcelo.shop", "www.vasconcelo.shop", "vasconcelo.netlify.app"]);
    expect(o.trustedOrigins).not.toContain(`https://${H}`);
  });
  it("con la variable, suma la vista previa a hosts y orígenes de confianza", () => {
    process.env.AUTH_PREVIEW_HOSTS = H;
    try {
      const o = authDomainOptions("https://vasconcelo.shop") as { baseURL: { allowedHosts: string[] }; trustedOrigins: string[] };
      expect(o.baseURL.allowedHosts).toContain(H);
      expect(o.trustedOrigins).toContain(`https://${H}`);
    } finally { delete process.env.AUTH_PREVIEW_HOSTS; }
  });
  it("en local o con otra URL base no cambia nada", () => {
    process.env.AUTH_PREVIEW_HOSTS = H;
    try {
      expect(authDomainOptions("http://localhost:3000")).toEqual({ baseURL: "http://localhost:3000", trustedOrigins: ["http://localhost:3000"] });
    } finally { delete process.env.AUTH_PREVIEW_HOSTS; }
  });
});
