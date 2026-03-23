import { Hono } from "hono";
import type Database from "better-sqlite3";

export function skillGapsRoutes(db: Database.Database) {
  const app = new Hono();

  // GET / — list all skill gap projects, optionally filter by status/priority
  app.get("/", (c) => {
    const status = c.req.query("status");
    const priority = c.req.query("priority");

    let sql = "SELECT * FROM skill_gap_projects WHERE 1=1";
    const params: string[] = [];

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (priority) {
      sql += " AND priority = ?";
      params.push(priority);
    }

    sql += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at DESC";

    const projects = db.prepare(sql).all(...params);

    // Parse JSON fields for response
    const parsed = projects.map((p: any) => ({
      ...p,
      target_skills: p.target_skills ? JSON.parse(p.target_skills) : [],
      target_classifications: p.target_classifications ? JSON.parse(p.target_classifications) : [],
    }));

    return c.json({ count: parsed.length, projects: parsed });
  });

  // POST / — add a new skill gap project
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { title, description, target_skills, target_classifications, job_control, priority, notes } = body;

    if (!title) {
      return c.json({ error: "title is required" }, 400);
    }

    const skillsJson = Array.isArray(target_skills) ? JSON.stringify(target_skills) : target_skills || null;
    const classJson = Array.isArray(target_classifications) ? JSON.stringify(target_classifications) : target_classifications || null;

    const result = db.prepare(`
      INSERT INTO skill_gap_projects (title, description, target_skills, target_classifications, job_control, priority, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(title, description, skillsJson, classJson, job_control || null, priority || "medium", notes || null);

    return c.json({ id: result.lastInsertRowid, created: true }, 201);
  });

  // PATCH /:id — update status, priority, or notes
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const updates: string[] = [];
    const params: any[] = [];

    if (body.status) { updates.push("status = ?"); params.push(body.status); }
    if (body.priority) { updates.push("priority = ?"); params.push(body.priority); }
    if (body.notes !== undefined) { updates.push("notes = ?"); params.push(body.notes); }
    if (body.title) { updates.push("title = ?"); params.push(body.title); }
    if (body.description) { updates.push("description = ?"); params.push(body.description); }

    if (updates.length === 0) {
      return c.json({ error: "Nothing to update" }, 400);
    }

    updates.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE skill_gap_projects SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return c.json({ id, updated: true });
  });

  // DELETE /:id
  app.delete("/:id", (c) => {
    const id = c.req.param("id");
    db.prepare("DELETE FROM skill_gap_projects WHERE id = ?").run(id);
    return c.json({ deleted: true });
  });

  return app;
}
