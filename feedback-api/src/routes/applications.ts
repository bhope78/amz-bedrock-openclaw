import { Hono } from "hono";
import type Database from "better-sqlite3";

export function applicationRoutes(db: Database.Database) {
  const app = new Hono();

  // Log an application event
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { job_control, classification, doc_type, revision_number, feedback_ids_used, outcome, notes } = body;

    if (!job_control || !doc_type) {
      return c.json({ error: "job_control and doc_type are required" }, 400);
    }

    const stmt = db.prepare(`
      INSERT INTO application_log (job_control, classification, doc_type, revision_number, feedback_ids_used, outcome, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(job_control, classification, doc_type, revision_number || 1, feedback_ids_used, outcome, notes);
    return c.json({ id: result.lastInsertRowid, message: "Application logged" }, 201);
  });

  // Get application history for a job
  app.get("/:job_control", (c) => {
    const job_control = c.req.param("job_control");
    const rows = db.prepare(
      "SELECT * FROM application_log WHERE job_control = ? ORDER BY revision_number ASC"
    ).all(job_control);
    return c.json({ count: rows.length, log: rows });
  });

  // Get all applications summary
  app.get("/", (c) => {
    const rows = db.prepare(`
      SELECT job_control, classification, doc_type, MAX(revision_number) as revisions,
      outcome, MAX(created_at) as last_updated
      FROM application_log GROUP BY job_control, doc_type ORDER BY last_updated DESC
    `).all();
    return c.json({ count: rows.length, applications: rows });
  });

  return app;
}
