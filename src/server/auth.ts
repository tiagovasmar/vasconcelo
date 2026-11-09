import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { sendMail } from "./mail";
import { googleCredentials } from "./google";
import { authSecret } from "./secret";
import { authDomainOptions } from "./auth-domains";

/** URL pública del sitio. En Netlify, si falta BETTER_AUTH_URL se usa la dirección que la plataforma informa (`URL`, o `DEPLOY_PRIME_URL` en vistas previas). */
const baseURL = process.env.BETTER_AUTH_URL || process.env.URL || "http://localhost:3000";
const prod = process.env.NODE_ENV === "production";

function createAuth() {
  return betterAuth({
    ...authDomainOptions(baseURL),
    secret: authSecret(),
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Recuperá el acceso a tu cuenta",
          kind: "recuperacion",
          link: url,
          text: `Hola ${user.name}:\n\nPara elegir una contraseña nueva entrá a este enlace (vale 1 hora y se usa una sola vez):\n${url}\n\nSi no lo pediste, ignorá este mensaje: tu contraseña no cambia.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: "Confirmá tu correo",
          kind: "verificacion",
          link: url,
          text: `Hola ${user.name}:\n\nConfirmá tu correo entrando a este enlace (vale 24 horas):\n${url}\n\nSi no creaste una cuenta, ignorá este mensaje.`,
        });
      },
    },
    // Ingreso con Google (solo si hay credenciales en el entorno: sin ellas el botón no aparece y la ruta no existe).
    ...(googleCredentials() ? { socialProviders: { google: { ...googleCredentials()!, prompt: "select_account" as const } } } : {}),
    // Vinculación segura: una cuenta de Google se une a una cuenta existente SOLO si el correo es el mismo, Google lo informa verificado Y la cuenta local también lo tiene verificado
    // (`requireLocalEmailVerified`). A propósito NO se declara a Google «proveedor de confianza»: así, si Google no informa el correo verificado, no se vincula. Así nadie se apropia de una cuenta registrando antes el correo ajeno sin confirmarlo. Nunca se vincula con otro correo.
    account: { accountLinking: { enabled: true, allowDifferentEmails: false, requireLocalEmailVerified: true } },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: prod,
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      // Detrás de Netlify la IP del visitante la informa la plataforma en este encabezado.
      ipAddress: { ipAddressHeaders: ["x-nf-client-connection-ip", "x-forwarded-for"] },
    },
    // Límites de uso persistentes (base de datos). Detrás de un proxy, la IP sale del encabezado x-forwarded-for.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 8 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 5 },
        "/reset-password": { window: 60, max: 10 },
        "/get-session": false,
      },
    },
    plugins: [nextCookies()],
  });
}

const g = globalThis as unknown as { __tiendaAuth?: ReturnType<typeof createAuth> };
/** Instancia única (se crea al primer uso para no abrir la base durante el build). */
export function getAuth() {
  return (g.__tiendaAuth ??= createAuth());
}
