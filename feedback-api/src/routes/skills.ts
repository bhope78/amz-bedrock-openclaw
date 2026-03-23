import { Hono } from "hono";
import type Database from "better-sqlite3";

export function skillsRoutes(db: Database.Database) {
  const app = new Hono();

  // GET / — list all skills, optionally filter by category
  app.get("/", (c) => {
    const category = c.req.query("category");
    const q = c.req.query("q");

    let sql = "SELECT * FROM skills WHERE 1=1";
    const params: string[] = [];

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }
    if (q) {
      sql += " AND (skill LIKE ? OR evidence LIKE ?)";
      params.push(`%${q}%`, `%${q}%`);
    }

    sql += " ORDER BY category, skill";
    const skills = db.prepare(sql).all(...params);
    return c.json({ count: skills.length, skills });
  });

  // GET /profile — get a full skills profile organized by category
  app.get("/profile", (c) => {
    const skills = db.prepare("SELECT * FROM skills ORDER BY category, skill").all() as any[];
    const profile: Record<string, any[]> = {};
    for (const skill of skills) {
      if (!profile[skill.category]) profile[skill.category] = [];
      profile[skill.category].push(skill);
    }

    const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();

    return c.json({ profile, projects, total_skills: skills.length });
  });

  // POST / — add or update a skill
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { skill, category, proficiency, evidence, source } = body;

    if (!skill || !category) {
      return c.json({ error: "skill and category are required" }, 400);
    }

    // Check if skill already exists from same source
    const existing = db.prepare(
      "SELECT id FROM skills WHERE skill = ? AND source = ?"
    ).get(skill, source || null) as any;

    if (existing) {
      db.prepare(`
        UPDATE skills SET category = ?, proficiency = ?, evidence = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(category, proficiency, evidence, existing.id);
      return c.json({ id: existing.id, updated: true });
    } else {
      const result = db.prepare(`
        INSERT INTO skills (skill, category, proficiency, evidence, source)
        VALUES (?, ?, ?, ?, ?)
      `).run(skill, category, proficiency, evidence, source);
      return c.json({ id: result.lastInsertRowid, created: true }, 201);
    }
  });

  // POST /bulk — add multiple skills at once
  app.post("/bulk", async (c) => {
    const body = await c.req.json();
    const { skills } = body as { skills: Array<{ skill: string; category: string; proficiency?: string; evidence?: string; source?: string }> };

    if (!skills || !Array.isArray(skills)) {
      return c.json({ error: "skills array is required" }, 400);
    }

    const insert = db.prepare(`
      INSERT INTO skills (skill, category, proficiency, evidence, source)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `);

    const upsert = db.transaction((items: typeof skills) => {
      let added = 0;
      for (const s of items) {
        const existing = db.prepare("SELECT id FROM skills WHERE skill = ? AND source = ?").get(s.skill, s.source || null) as any;
        if (existing) {
          db.prepare("UPDATE skills SET category = ?, proficiency = ?, evidence = ?, updated_at = datetime('now') WHERE id = ?")
            .run(s.category, s.proficiency, s.evidence, existing.id);
        } else {
          insert.run(s.skill, s.category, s.proficiency, s.evidence, s.source);
          added++;
        }
      }
      return added;
    });

    const added = upsert(skills);
    return c.json({ added, total: skills.length }, 201);
  });

  // DELETE /:id — remove a skill by ID
  app.delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    const result = db.prepare("DELETE FROM skills WHERE id = ?").run(id);
    if (result.changes === 0) return c.json({ error: "Skill not found" }, 404);
    return c.json({ deleted: true, id });
  });

  return app;
}
