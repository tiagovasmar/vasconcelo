import { spawn } from "node:child_process";
import fs from "node:fs";

/** Builds nuevos y secuenciales; luego TODA la suite en una sola ejecución, incluido WebKit. */
async function main() {
  Object.assign(process.env, { SKIP_ENV_FILES: "1", TEST_DATABASE_URL: "", DIRECT_URL: "", E2E_WEBKIT: "1", E2E_SERVERS: "", E2E_SKIP_BUILD: "1", CIRCLE_NODE_TOTAL: "3" });
  const { default: config } = await import("../playwright.config");
  const servers = config.webServer as Array<{ env?: Record<string, string> }>;
  const seen = new Set<string>();
  const run = (args: string[], env: NodeJS.ProcessEnv) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Proceso local terminó con código ${code}`)));
  });
  const builds: string[] = [];
  for (const server of servers) {
    const env = server.env;
    if (!env?.NEXT_DIST_DIR || seen.has(env.NEXT_DIST_DIR)) continue;
    seen.add(env.NEXT_DIST_DIR);
    console.log(`BUILD FINAL NUEVO: ${env.E2E_TAG}`);
    await run(["node_modules/next/dist/bin/next", "build"], { ...process.env, ...env });
    builds.push(env.NEXT_DIST_DIR);
  }
  fs.mkdirSync(".local", { recursive: true });
  fs.writeFileSync(".local/e2e-builds-finales.json", JSON.stringify({ at: new Date().toISOString(), builds }, null, 2));
  console.log("Todos los builds nuevos terminaron. Iniciando la suite completa con bases descartables.");
  await run(["node_modules/@playwright/test/cli.js", "test", "--reporter=list,json"], { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: ".local/playwright-final.json" });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
