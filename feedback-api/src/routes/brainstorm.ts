import { Hono } from "hono";
import type Database from "better-sqlite3";

export function brainstormRoutes(db: Database.Database) {
  const app = new Hono();

  // Get brainstorm notes for a job
  app.get("/:job_control", (c) => {
    const job_control = c.req.param("job_control");
    const rows = db.prepare(
      "SELECT * FROM brainstorm_notes WHERE job_control = ? ORDER BY created_at DESC"
    ).all(job_control);
    return c.json({ count: rows.length, notes: rows });
  });

  // Get brainstorm notes by classification (for finding patterns)
  app.get("/by-classification/:classification", (c) => {
    const classification = c.req.param("classification");
    const rows = db.prepare(
      "SELECT * FROM brainstorm_notes WHERE classification = ? ORDER BY created_at DESC"
    ).all(classification);
    return c.json({ count: rows.length, notes: rows });
  });

  // Add brainstorm notes
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { job_control, classification, highlights, avoid, notes } = body;

    if (!job_control) {
      return c.json({ error: "job_control is required" }, 400);
    }

    const stmt = db.prepare(`
      INSERT INTO brainstorm_notes (job_control, classification, highlights, avoid, notes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(job_control, classification, highlights, avoid, notes);
    return c.json({ id: result.lastInsertRowid, message: "Brainstorm notes stored" }, 201);
  });

  // Update brainstorm notes
  app.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { highlights, avoid, notes } = body;

    db.prepare(`
      UPDATE brainstorm_notes SET highlights = COALESCE(?, highlights),
      avoid = COALESCE(?, avoid), notes = COALESCE(?, notes),
      updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(highlights, avoid, notes, id);

    return c.json({ message: "Updated" });
  });

  return app;
}
