import { Hono } from "hono";
import type Database from "better-sqlite3";

export function feedbackRoutes(db: Database.Database) {
  const app = new Hono();

  // Add feedback entry
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { job_control, classification, doc_type, section, sentiment, content, context } = body;

    if (!doc_type || !sentiment || !content) {
      return c.json({ error: "doc_type, sentiment, and content are required" }, 400);
    }

    const stmt = db.prepare(`
      INSERT INTO feedback (job_control, classification, doc_type, section, sentiment, content, context)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(job_control, classification, doc_type, section, sentiment, content, context);

    return c.json({ id: result.lastInsertRowid, message: "Feedback stored" }, 201);
  });

  // Search feedback
  app.get("/search", (c) => {
    const classification = c.req.query("classification");
    const doc_type = c.req.query("doc_type");
    const sentiment = c.req.query("sentiment");
    const q = c.req.query("q");
    const limit = parseInt(c.req.query("limit") || "50");

    let sql = "SELECT * FROM feedback WHERE 1=1";
    const params: any[] = [];

    if (classification) {
      sql += " AND classification = ?";
      params.push(classification);
    }
    if (doc_type) {
      sql += " AND doc_type = ?";
      params.push(doc_type);
    }
    if (sentiment) {
      sql += " AND sentiment = ?";
      params.push(sentiment);
    }
    if (q) {
      sql += " AND content LIKE ?";
      params.push(`%${q}%`);
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    return c.json({ count: rows.length, results: rows });
  });

  // Get feedback by ID
  app.get("/:id", (c) => {
    const id = c.req.param("id");
    const row = db.prepare("SELECT * FROM feedback WHERE id = ?").get(id);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  });

  // Delete feedback
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    db.prepare("DELETE FROM feedback WHERE id = ?").run(id);
    return c.json({ message: "Deleted" });
  });

  return app;
}
