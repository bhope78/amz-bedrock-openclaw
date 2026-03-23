import { Hono } from "hono";
import type Database from "better-sqlite3";

export function orgTechRoutes(db: Database.Database) {
  const app = new Hono();

  // GET / — list all, optionally filter by department or tech
  app.get("/", (c) => {
    const department = c.req.query("department");
    const tech = c.req.query("tech");

    let sql = "SELECT * FROM org_tech_stacks WHERE 1=1";
    const params: string[] = [];

    if (department) {
      sql += " AND department LIKE ?";
      params.push(`%${department}%`);
    }
    if (tech) {
      sql += " AND tech LIKE ?";
      params.push(`%${tech}%`);
    }

    sql += " ORDER BY department, tech";
    const rows = db.prepare(sql).all(...params);
    return c.json({ count: rows.length, entries: rows });
  });

  // GET /by-department — grouped by department
  app.get("/by-department", (c) => {
    const rows = db.prepare(
      "SELECT department, GROUP_CONCAT(tech, ', ') as tech_stack, COUNT(*) as tech_count FROM org_tech_stacks GROUP BY department ORDER BY tech_count DESC"
    ).all() as any[];

    return c.json({
      count: rows.length,
      departments: rows.map((r) => ({
        department: r.department,
        tech_stack: r.tech_stack.split(", "),
        tech_count: r.tech_count,
      })),
    });
  });

  // GET /by-tech — grouped by technology (which departments use it)
  app.get("/by-tech", (c) => {
    const rows = db.prepare(
      "SELECT tech, GROUP_CONCAT(department, ', ') as departments, COUNT(*) as dept_count FROM org_tech_stacks GROUP BY tech ORDER BY dept_count DESC"
    ).all() as any[];

    return c.json({
      count: rows.length,
      technologies: rows.map((r) => ({
        tech: r.tech,
        departments: r.departments.split(", "),
        dept_count: r.dept_count,
      })),
    });
  });

  // GET /match — find departments that match Bryan's skills
  app.get("/match", (c) => {
    const bryansSkills = db.prepare("SELECT skill FROM skills").all() as any[];
    const skillSet = new Set(bryansSkills.map((s: any) => s.skill.toLowerCase()));

    const rows = db.prepare(
      "SELECT department, tech FROM org_tech_stacks ORDER BY department"
    ).all() as any[];

    const deptMap: Record<string, { matched: string[]; unmatched: string[] }> = {};
    for (const row of rows) {
      if (!deptMap[row.department]) deptMap[row.department] = { matched: [], unmatched: [] };
      if (skillSet.has(row.tech.toLowerCase())) {
        deptMap[row.department].matched.push(row.tech);
      } else {
        deptMap[row.department].unmatched.push(row.tech);
      }
    }

    const results = Object.entries(deptMap)
      .map(([dept, { matched, unmatched }]) => ({
        department: dept,
        match_rate: matched.length / (matched.length + unmatched.length),
        matched_skills: matched,
        gap_skills: unmatched,
      }))
      .sort((a, b) => b.match_rate - a.match_rate);

    return c.json({ departments: results });
  });

  // POST / — add tech for a department
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { department, tech, context, job_control, job_title, confidence } = body;

    if (!department || !tech) {
      return c.json({ error: "department and tech are required" }, 400);
    }

    // Handle single or bulk
    const techs = Array.isArray(tech) ? tech : [tech];
    let added = 0;

    for (const t of techs) {
      try {
        db.prepare(`
          INSERT INTO org_tech_stacks (department, tech, context, job_control, job_title, confidence)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(department, tech) DO UPDATE SET
            context = COALESCE(excluded.context, context),
            job_control = COALESCE(excluded.job_control, job_control),
            job_title = COALESCE(excluded.job_title, job_title),
            confidence = excluded.confidence
        `).run(department, t.trim(), context || null, job_control || null, job_title || null, confidence || "confirmed");
        added++;
      } catch {}
    }

    return c.json({ added, department }, 201);
  });

  return app;
}
