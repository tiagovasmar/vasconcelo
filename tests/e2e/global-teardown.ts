// Los servidores e2e usan carpetas de build propias (.next-e2e-*) y Next reescribe next-env.d.ts apuntando a la última.
// Se restaura a la carpeta estándar (.next) para que el typecheck funcione en una copia limpia y no ensucie el árbol de Git.
import fs from "node:fs";

export default async function globalTeardown() {
  const file = "next-env.d.ts";
  const text = fs.readFileSync(file, "utf8");
  const fixed = text.replace(/\.\/\.next-[\w-]+\//g, "./.next/");
  if (fixed !== text) fs.writeFileSync(file, fixed);
}
