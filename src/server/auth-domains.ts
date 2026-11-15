const STORE_HOSTS = ["vasconcelo.shop", "www.vasconcelo.shop", "vasconcelo.netlify.app"];

/**
 * Dominios de vista previa de ESTE sitio en Netlify (por ejemplo `rama--vasconcelo.netlify.app`) que pueden iniciar sesión.
 * Se declaran a mano en `AUTH_PREVIEW_HOSTS` (separados por coma) y solo se acepta un nombre exacto que termine en `--vasconcelo.netlify.app`:
 * nada de comodines, de otros sitios ni de dominios propios. Sin la variable no cambia nada.
 */
const PREVIEW_HOST = /^[a-z0-9][a-z0-9-]{0,60}--vasconcelo\.netlify\.app$/;

export function previewHosts(raw = process.env.AUTH_PREVIEW_HOSTS): string[] {
  return (raw ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => PREVIEW_HOST.test(host));
}

/** Solo los dominios propios (más las vistas previas declaradas); localhost y vistas previas no declaradas conservan su URL aislada. */
export function authDomainOptions(baseURL: string) {
  const url = new URL(baseURL);
  if (url.protocol === "https:" && STORE_HOSTS.includes(url.host)) {
    const hosts = [...STORE_HOSTS, ...previewHosts()];
    return { baseURL: { allowedHosts: hosts, protocol: "https" as const }, trustedOrigins: hosts.map((host) => `https://${host}`) };
  }
  return { baseURL, trustedOrigins: [url.origin] };
}
