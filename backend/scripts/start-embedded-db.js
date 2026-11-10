/**
 * Local development helper when Docker/system Postgres is unavailable.
 * Starts embedded Postgres on port 5433 and keeps the process alive.
 */
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default;

const PORT = Number(process.env.EMBEDDED_PG_PORT || 5433);
const databaseDir = path.join(__dirname, '..', '.pgdata');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'pos',
    password: 'pos_secret',
    port: PORT,
    persistent: true,
    autoRehydrateSymlinks: true,
  });

  await pg.initialise();
  await pg.start();

  try {
    await pg.createDatabase('restaurant_pos');
  } catch (err) {
    if (!String(err.message || err).toLowerCase().includes('already exists')) {
      // Database may already exist on subsequent runs.
      if (!String(err.message || err).includes('exists')) {
        console.warn('createDatabase:', err.message);
      }
    }
  }

  console.log(`Embedded Postgres running on port ${PORT}`);
  console.log(
    `DATABASE_URL=postgresql://pos:pos_secret@127.0.0.1:${PORT}/restaurant_pos?schema=public`
  );

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
