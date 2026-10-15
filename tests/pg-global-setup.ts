import { startTestPostgres } from "../scripts/lib/test-postgres";

/** Arranca un PostgreSQL real descartable para toda la corrida de Vitest (ver scripts/lib/test-postgres.ts). */
export default async function setup() {
  const pg = await startTestPostgres();
  process.env.TEST_PG_ADMIN_URL = pg.adminUrl;
  return async () => {
    await pg.stop();
  };
}
