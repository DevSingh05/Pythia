import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

async function run() {
  console.log("Adding new columns to markets table...");
  try {
    await sql`
      ALTER TABLE markets 
      ADD COLUMN IF NOT EXISTS slug TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS volume24h DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS liquidity DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS clob_token_id TEXT,
      ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS closed BOOLEAN DEFAULT FALSE;
    `;
    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

run();
