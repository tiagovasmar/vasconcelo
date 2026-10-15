import fs from "node:fs";
import path from "node:path";

// Muestra los últimos correos del transporte LOCAL de desarrollo (.local/mail). Contienen enlaces con tokens: es solo para
// uso en tu computadora; no los pegues en chats, issues ni logs compartidos.
const dir = path.resolve(process.env.MAIL_DIR || ".local/mail");
const n = Number(process.argv[2] || 3);
if (!fs.existsSync(dir)) {
  console.log(`Todavía no hay correos locales en ${dir}.`);
  process.exit(0);
}
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().slice(-n).reverse();
if (!files.length) console.log(`Todavía no hay correos locales en ${dir}.`);
for (const f of files) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  console.log(`\n— ${m.createdAt} · ${m.kind} · para ${m.to}\n  Asunto: ${m.subject}\n  Enlace: ${m.link}`);
}
