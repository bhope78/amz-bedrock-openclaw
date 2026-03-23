import { Hono } from "hono";
import type Database from "better-sqlite3";

export function styleRulesRoutes(db: Database.Database) {
  const app = new Hono();

  // Get all active style rules (the "style guide")
  app.get("/", (c) => {
    const scope = c.req.query("scope");
    const category = c.req.query("category");

    let sql = "SELECT * FROM style_rules WHERE active = 1";
    const params: any[] = [];

    if (scope) {
      sql += " AND (scope = ? OR scope = 'universal')";
      params.push(scope);
    }
    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    sql += " ORDER BY category, created_at DESC";
    const rows = db.prepare(sql).all(...params);
    return c.json({ count: rows.length, rules: rows });
  });

  // Add a style rule
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { rule, category, scope, source_feedback_ids } = body;

    if (!rule || !category) {
      return c.json({ error: "rule and category are required" }, 400);
    }

    const stmt = db.prepare(`
      INSERT INTO style_rules (rule, category, scope, source_feedback_ids)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(rule, category, scope || "universal", source_feedback_ids);
    return c.json({ id: result.lastInsertRowid, message: "Style rule added" }, 201);
  });

  // Deactivate a style rule
  app.patch("/:id/deactivate", (c) => {
    const id = c.req.param("id");
    db.prepare("UPDATE style_rules SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return c.json({ message: "Deactivated" });
  });

  // Update a style rule
  app.put("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { rule, category, scope } = body;

    db.prepare(`
      UPDATE style_rules SET rule = COALESCE(?, rule), category = COALESCE(?, category),
      scope = COALESCE(?, scope), updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(rule, category, scope, id);

    return c.json({ message: "Updated" });
  });

  return app;
}
