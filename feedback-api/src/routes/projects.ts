import { Hono } from "hono";
import type Database from "better-sqlite3";

export function projectsRoutes(db: Database.Database) {
  const app = new Hono();

  // GET / — list all projects
  app.get("/", (c) => {
    const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();
    return c.json({ count: projects.length, projects });
  });

  // GET /:repo — get project by repo name
  app.get("/:repo{.+}", (c) => {
    const repo = c.req.param("repo");
    const project = db.prepare("SELECT * FROM projects WHERE repo = ?").get(repo);
    if (!project) return c.json({ error: "Project not found" }, 404);

    // Get associated skills
    const skills = db.prepare("SELECT * FROM skills WHERE source = ?").all(repo);
    return c.json({ project, skills });
  });

  // POST / — add or update a project
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { repo, name, description, tech_stack, role, highlights } = body;

    if (!repo || !name) {
      return c.json({ error: "repo and name are required" }, 400);
    }

    const techStackJson = Array.isArray(tech_stack) ? JSON.stringify(tech_stack) : tech_stack;

    const existing = db.prepare("SELECT id FROM projects WHERE repo = ?").get(repo) as any;

    if (existing) {
      db.prepare(`
        UPDATE projects SET name = ?, description = ?, tech_stack = ?, role = ?, highlights = ?, updated_at = datetime('now')
        WHERE repo = ?
      `).run(name, description, techStackJson, role, highlights, repo);
      return c.json({ id: existing.id, updated: true });
    } else {
      const result = db.prepare(`
        INSERT INTO projects (repo, name, description, tech_stack, role, highlights)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(repo, name, description, techStackJson, role, highlights);
      return c.json({ id: result.lastInsertRowid, created: true }, 201);
    }
  });

  return app;
}
