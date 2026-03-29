import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

async function run() {
  console.log("Dropping markets to force re-hydration with new schema rules...");
  try {
    // Delete all markets so they get fetched dynamically again
    // This removes the stale `null` probabilities and slugs from before the upgrade
    await sql`DELETE FROM markets`;
    // also delete prob_series to start fresh
    await sql`DELETE FROM prob_series`;
    console.log("Delete successful!");
  } catch (err) {
    console.error("Delete failed:", err);
  }
}

run();
