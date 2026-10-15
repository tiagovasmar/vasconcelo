import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "../src/db/schema";
import { describeTarget, isLocalTarget, scriptDb, scriptUrl } from "./lib/env";

/**
 * Cuenta de ADMINISTRADOR de PRUEBA solo para la base de desarrollo local (correo ADMIN_EMAIL de .env.local, ya confirmado).
 * La contraseña de prueba se genera al azar y queda en `.local/dev-admin.txt` (ignorado por Git). Se niega a correr contra una base remota.
 */
async function main() {
  const url = scriptUrl();
  if (!isLocalTarget(url)) { console.error(`Rechazado: ${describeTarget(url)} no es una base local.`); process.exit(1); }
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email) { console.error("Falta ADMIN_EMAIL en .env.local."); process.exit(1); }
  const file = path.resolve(".local/dev-admin.txt");
  const pw = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : randomBytes(12).toString("base64url");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pw);
  const db = scriptDb();
  const hash = await hashPassword(pw);
  const now = new Date();
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing) {
    await db.update(account).set({ password: hash, updatedAt: now }).where(eq(account.userId, existing.id));
    await db.update(user).set({ emailVerified: true, updatedAt: now }).where(eq(user.id, existing.id));
  } else {
    const id = randomBytes(16).toString("hex");
    await db.insert(user).values({ id, name: "Admin de prueba", email, emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(account).values({ id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: now, updatedAt: now });
  }
  console.log(`Administrador de prueba listo en ${describeTarget(url)} (${email}). Contraseña en .local/dev-admin.txt`);
  await db.$client.end({ timeout: 5 });
}
main().catch((e) => { console.error(e); process.exit(1); });
