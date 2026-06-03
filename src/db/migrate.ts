import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// biome-ignore lint/style/noNonNullAssertion: required for migrations
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./drizzle/migrations" });

await client.end();
