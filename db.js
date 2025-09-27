import Database from "better-sqlite3";

const db = new Database("demo.db");
db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
db.exec("INSERT OR IGNORE INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob')");

const rows = db.prepare("SELECT * FROM users").all();
console.log(rows);

