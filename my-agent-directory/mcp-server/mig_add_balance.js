import Database from "better-sqlite3";

const db = new Database("../../demo.db");
const cols = db.prepare(`PRAGMA table_info(users)`).all();
const hasBalance = cols.some((c) => c.name === "balance");
if (!hasBalance) {
  db.exec(`ALTER TABLE users ADD COLUMN balance REAL NOT NULL DEFAULT 0;`);
}