require("dotenv/config");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  try {
    const result = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name ILIKE '%migration%'
         OR table_name ILIKE '%drizzle%'
      ORDER BY table_schema, table_name
    `);

    console.table(result.rows);

    for (const row of result.rows) {
      try {
        const r = await pool.query(
          `SELECT * FROM "${row.table_schema}"."${row.table_name}"`
        );
        console.log(`\n${row.table_schema}.${row.table_name}:`);
        console.table(r.rows);
      } catch (e) {
        console.log(`Could not read ${row.table_schema}.${row.table_name}: ${e.message}`);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    await pool.end();
  }
}

check();
