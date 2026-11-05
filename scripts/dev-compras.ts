import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { createDb } from "../src/db/client";
import { account, user } from "../src/db/schema";

const url = "postgres://postgres:postgres@127.0.0.1:54571/vasconcelo_dev";

async function main() {
  if (process.env.ENTORNO_DESCARTABLE !== "1" || process.env.DATABASE_URL !== url) throw new Error("Usá la base descartable de Compras en el puerto 54571.");
  const db = createDb(url);
  const now = new Date();
  try {
    const [config] = await db.$client`show data_directory`;
    if (path.resolve(String(config.data_directory)).toLowerCase() !== path.resolve(".local/dev-pg-compras/data").toLowerCase()) {
      throw new Error("El puerto está ocupado por otra instancia de PostgreSQL.");
    }
    const password = await hashPassword("Demo-Compras-2026!");
    for (const name of ["admin", "cliente", "otra"]) {
      const id = `compras-${name}`;
      const email = `${name}.compras@example.test`;
      await db.transaction(async (tx) => {
        await tx.insert(user).values({ id, email, name: `${name} de prueba`, emailVerified: true, createdAt: now, updatedAt: now }).onConflictDoNothing();
        await tx.insert(account).values({ id: `credential-${id}`, accountId: id, userId: id, providerId: "credential", password, createdAt: now, updatedAt: now }).onConflictDoNothing();
      });
    }
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
