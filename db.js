import Database from "better-sqlite3";

const db = new Database("demo.db");

function ensureUsersTable() {
	// Check if the users table exists
	const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
	if (tbl.length === 0) {
		// Fresh create with desired constraints
		db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
		return;
	}

	// Inspect existing table schema
	const info = db.prepare("PRAGMA table_info('users')").all();
	const idCol = info.find((c) => c.name === 'id');
	const nameCol = info.find((c) => c.name === 'name');
	const idIsPk = idCol && idCol.pk === 1;
	const nameNotNull = nameCol && nameCol.notnull === 1;

	// If schema already matches, nothing to do
	if (idIsPk && nameNotNull) return;

	// Otherwise migrate: create new table with correct schema, copy data, replace
	console.log('Migrating users table to add PRIMARY KEY / NOT NULL constraints');
	db.exec('BEGIN TRANSACTION');
	db.exec('CREATE TABLE IF NOT EXISTS users_new (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
	// Preserve existing data; replace NULL names with 'Unknown' to satisfy NOT NULL
	db.prepare("INSERT OR IGNORE INTO users_new (id, name) SELECT id, COALESCE(name, 'Unknown') FROM users").run();
	db.exec('DROP TABLE users');
	db.exec("ALTER TABLE users_new RENAME TO users");
	db.exec('COMMIT');
}

ensureUsersTable();

// Seed data idempotently
db.exec("INSERT OR IGNORE INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob')");

const rows = db.prepare("SELECT * FROM users").all();
console.log(rows);
