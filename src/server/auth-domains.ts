const STORE_HOSTS = ["vasconcelo.shop", "www.vasconcelo.shop", "vasconcelo.netlify.app"];

/** Solo los dominios propios; localhost y vistas previas conservan su URL aislada. */
export function authDomainOptions(baseURL: string) {
  const url = new URL(baseURL);
  if (url.protocol === "https:" && STORE_HOSTS.includes(url.host)) {
    return { baseURL: { allowedHosts: [...STORE_HOSTS], protocol: "https" as const }, trustedOrigins: STORE_HOSTS.map((host) => `https://${host}`) };
  }
  return { baseURL, trustedOrigins: [url.origin] };
}
