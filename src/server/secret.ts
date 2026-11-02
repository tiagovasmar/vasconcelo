import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Secreto de firma: variable de entorno; en desarrollo se genera una vez en `.local/auth-secret` (ignorado por Git). */
export function authSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("Falta BETTER_AUTH_SECRET en producción.");
  const file = path.resolve(/*turbopackIgnore: true*/ process.env.AUTH_SECRET_FILE || ".local/auth-secret");
  try {
    return fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim();
  } catch {
    fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
    const secret = randomBytes(32).toString("hex");
    fs.writeFileSync(/*turbopackIgnore: true*/ file, secret, { mode: 0o600 });
    return secret;
  }
}

/** Firma HMAC-SHA256 (base64url) de un texto con el secreto del servidor. Sirve para enlaces que no se pueden adivinar ni falsificar y no hace falta guardar. */
export const signText = (text: string): string => createHmac("sha256", authSecret()).update(text).digest("base64url");
export function verifyText(text: string, signature: string): boolean {
  const a = Buffer.from(signText(text));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
