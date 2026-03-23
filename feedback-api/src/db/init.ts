import { mkdirSync } from "fs";
import { join } from "path";
import { getDb, initDb } from "./schema.js";

const dataDir = join(import.meta.dirname, "..", "..", "data");
mkdirSync(dataDir, { recursive: true });

const db = getDb();
initDb(db);
console.log("Database initialized at:", join(dataDir, "feedback.db"));
db.close();
