import { randomBytes } from "node:crypto";
import readline from "node:readline";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "../src/db/schema";
import { describeTarget, scriptDb, scriptUrl } from "./lib/env";

/**
 * Crea (o restablece la contraseña de) la cuenta del ADMINISTRADOR directamente en la base, con el correo ya confirmado.
 *
 * Para qué: en la vista previa de Netlify todavía no hay correo transaccional, así que el administrador no puede confirmar su correo por el
 * camino normal. Este comando se corre desde TU computadora, con las credenciales de la base que solo vos tenés (DIRECT_URL en .env.local):
 * quien puede correrlo ya controla la base, así que no abre ninguna puerta nueva. NO crea cuentas de clientes.
 *
 *   npm run admin:crear                → crea la cuenta del correo ADMIN_EMAIL (pide la contraseña por teclado, sin mostrarla)
 *   npm run admin:crear -- --restablecer → cambia la contraseña de la cuenta existente
 *
 * La contraseña se guarda con el mismo hash (scrypt) que usa Better Auth; nunca se imprime, no se pasa por argumentos ni por variables.
 */
function ask(prompt: string, hidden: boolean): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    if (hidden) out._writeToOutput = (s: string) => { if (s.includes("\n") || s.includes("\r")) out.output.write("\n"); };
    process.stdout.write(prompt);
    rl.question("", (answer) => { rl.close(); resolve(answer); });
  });
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("Definí ADMIN_EMAIL (en .env.local): es el correo de la cuenta administradora."); process.exit(1); }
  if (!process.stdin.isTTY) { console.error("Este comando pide la contraseña por teclado: corrélo en una terminal interactiva."); process.exit(1); }
  const reset = process.argv.includes("--restablecer");
  const db = scriptDb();
  console.log(`Base: ${describeTarget(scriptUrl())}\nAdministrador: ${email}`);
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (existing && !reset) { console.error("Esa cuenta ya existe. Para cambiar su contraseña usá --restablecer."); process.exit(1); }
  if (!existing && reset) { console.error("Esa cuenta no existe todavía: corré el comando sin --restablecer."); process.exit(1); }
  const pw = await ask("Contraseña (mínimo 10 caracteres): ", true);
  const pw2 = await ask("Repetí la contraseña: ", true);
  if (pw !== pw2) { console.error("Las contraseñas no coinciden."); process.exit(1); }
  if (pw.length < 10 || pw.length > 128) { console.error("La contraseña debe tener entre 10 y 128 caracteres."); process.exit(1); }
  const hash = await hashPassword(pw);
  const now = new Date();
  if (existing) {
    const upd = await db.update(account).set({ password: hash, updatedAt: now }).where(eq(account.userId, existing.id)).returning({ id: account.id });
    if (!upd.length) await db.insert(account).values({ id: randomBytes(16).toString("hex"), accountId: existing.id, providerId: "credential", userId: existing.id, password: hash, createdAt: now, updatedAt: now });
    await db.update(user).set({ emailVerified: true, updatedAt: now }).where(eq(user.id, existing.id));
    console.log("Contraseña actualizada. Las sesiones abiertas siguen vigentes hasta que venzan; cerralas desde el navegador si hace falta.");
  } else {
    const id = randomBytes(16).toString("hex");
    await db.transaction(async (tx) => {
      await tx.insert(user).values({ id, name: "Administración", email, emailVerified: true, createdAt: now, updatedAt: now });
      await tx.insert(account).values({ id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: hash, createdAt: now, updatedAt: now });
    });
    console.log("Cuenta administradora creada con el correo confirmado. Ya podés ingresar en /cuenta/ingresar.");
  }
  await db.$client.end({ timeout: 5 });
}
main().catch((e) => { console.error(`Falló: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
