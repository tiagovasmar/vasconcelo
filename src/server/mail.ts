import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type Mail = { to: string; subject: string; text: string; kind: "verificacion" | "recuperacion"; link: string };

/**
 * ¿Está activo el transporte LOCAL (archivos)? Siempre en desarrollo y pruebas. En un build de producción solo si se pide
 * de forma explícita con `MAIL_TRANSPORT=local`, pensado únicamente para probar el build de producción en tu computadora
 * (las pruebas de recorrido lo usan). **Nunca** activarlo en un servidor público: `npm run release:check` lo marca como bloqueante.
 */
export function localMailActive(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.MAIL_TRANSPORT === "local";
}

/**
 * Transporte de correo.
 * - Desarrollo/pruebas: transporte LOCAL. Cada correo se guarda como archivo JSON en `.local/mail/` (o `MAIL_DIR`),
 *   carpeta ignorada por Git y nunca servida por la web. Los correos contienen tokens: no se imprimen en logs.
 *   Para verlos: `npm run mail:last` o abrir los archivos de esa carpeta.
 * - Producción: el transporte local está DESHABILITADO (salvo `MAIL_TRANSPORT=local`, solo para pruebas locales). Se envía por la API HTTP del proveedor
 *   configurado (Resend o Brevo; ver `mailConfig`). Sin proveedor configurado el envío falla con un error explícito (no se simula que se envió un correo).
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!localMailActive()) {
    const cfg = mailConfig();
    if (!cfg) throw new Error("Correo transaccional no configurado: faltan MAIL_PROVIDER, MAIL_API_KEY y MAIL_FROM (el transporte local está deshabilitado en producción).");
    await sendViaProvider(cfg, mail);
    return;
  }
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.MAIL_DIR || ".local/mail");
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${mail.kind}-${randomBytes(4).toString("hex")}.json`);
  fs.writeFileSync(/*turbopackIgnore: true*/ file, JSON.stringify({ ...mail, createdAt: new Date().toISOString(), transport: "local-file" }, null, 2), { mode: 0o600 });
}

/**
 * ¿Se pueden enviar correos en este entorno? Con el transporte local (desarrollo/pruebas) o con un proveedor configurado.
 * Mientras sea false, no se ofrece crear cuentas ni recuperar el acceso: no se debe decir «te enviamos un correo» si no se envió ninguno.
 * Quien administra la tienda conserva su acceso (ingreso con contraseña) aunque el correo no esté disponible.
 */
export function mailTransportAvailable(): boolean {
  return localMailActive() || mailConfig() !== null;
}

export type MailConfig = { provider: "resend" | "brevo"; apiKey: string; fromName: string | null; fromEmail: string };

/**
 * Proveedor real de correo (null = no configurado). `MAIL_FROM` admite `correo@dominio` o `Nombre <correo@dominio>`. El remitente tiene que estar
 * verificado en el proveedor: sin dominio propio NO sirve `netlify.app` (nadie puede verificarlo); ver docs/CORREO.md.
 */
export function mailConfig(): MailConfig | null {
  const provider = (process.env.MAIL_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = (process.env.MAIL_API_KEY ?? "").trim();
  const from = (process.env.MAIL_FROM ?? "").trim();
  if ((provider !== "resend" && provider !== "brevo") || !apiKey || !from) return null;
  const m = from.match(/^(?:"?([^"<]*?)"?s*)?<([^<>s@]+@[^<>s@]+)>$/) ?? from.match(/^()([^<>s@]+@[^<>s@]+)$/);
  if (!m) return null;
  return { provider, apiKey, fromName: m[1]?.trim() || null, fromEmail: m[2] };
}

export async function sendViaProvider(cfg: MailConfig, mail: Mail, fetchFn: typeof fetch = fetch): Promise<void> {
  const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail;
  const res =
    cfg.provider === "resend"
      ? await fetchFn("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }) })
      : await fetchFn("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": cfg.apiKey, "Content-Type": "application/json", accept: "application/json" }, body: JSON.stringify({ sender: { name: cfg.fromName ?? undefined, email: cfg.fromEmail }, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }) });
  // Nunca se registra el cuerpo del correo (lleva el enlace de un solo uso) ni la respuesta completa del proveedor.
  if (!res.ok) throw new Error(`El proveedor de correo (${cfg.provider}) rechazó el envío (HTTP ${res.status}).`);
}
