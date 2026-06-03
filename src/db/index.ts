import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// biome-ignore lint/style/noNonNullAssertion: app must not start without DATABASE_URL
const client = postgres(process.env.DATABASE_URL!);

export const db = drizzle(client, { schema });
