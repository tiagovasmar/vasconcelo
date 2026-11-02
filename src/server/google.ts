/**
 * Ingreso con Google. Se habilita únicamente si el entorno trae AMBAS credenciales (se crean en Google Cloud Console; ver docs/GOOGLE.md). Nunca se pide ni se guarda
 * una clave en el chat o en el repositorio: viven solo en variables de entorno del servidor. URI de redireccionamiento autorizado: ${BETTER_AUTH_URL}/api/auth/callback/google
 */
export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const googleEnabled = (): boolean => googleCredentials() !== null;
