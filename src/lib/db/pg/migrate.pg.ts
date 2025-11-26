import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "path";
import { pgDb } from "lib/db/pg/db.pg";

export const runMigrate = async () => {
  console.log("⏳ Running PostgreSQL migrations...");

  const start = Date.now();
  await migrate(pgDb, {
    migrationsFolder: join(process.cwd(), "src/lib/db/migrations/pg"),
  }).catch((err) => {
    const errorCode = err.cause?.code;
    const _errorMessage = err.cause?.message || err.message;

    if (errorCode === "42P07") {
      // Duplicate table error
      console.error(`❌ PostgreSQL migrations failed: Table already exists.`);
      console.error(`This usually means the migration was partially applied.`);
      console.error(
        `The migration file has been updated to be idempotent. Please try running migrations again.`,
      );
    } else {
      console.error(
        `❌ PostgreSQL migrations failed. Check the postgres instance is running.`,
        err.cause,
      );
    }
    throw err;
  });
  const end = Date.now();

  console.log("✅ PostgreSQL migrations completed in", end - start, "ms");
};
