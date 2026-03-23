import { Hono } from "hono";
import type Database from "better-sqlite3";

export function legacyTemplateRoutes(db: Database.Database) {
  const app = new Hono();

  // Get all legacy templates (list)
  app.get("/", (c) => {
    const rows = db.prepare(
      "SELECT id, template_name, template_index, job_count, created_at FROM legacy_templates ORDER BY template_index"
    ).all();
    return c.json({ count: rows.length, templates: rows });
  });

  // Get a specific legacy template with all its jobs
  app.get("/:name", (c) => {
    const name = c.req.param("name");
    const template = db.prepare(
      "SELECT * FROM legacy_templates WHERE template_name = ? OR id = ?"
    ).get(name, name) as any;

    if (!template) return c.json({ error: "Template not found" }, 404);

    const jobs = db.prepare(
      "SELECT * FROM legacy_template_jobs WHERE template_id = ? ORDER BY job_index"
    ).all(template.id);

    return c.json({ ...template, jobs });
  });

  // Search across all legacy template jobs
  app.get("/jobs/search", (c) => {
    const q = c.req.query("q");
    const job_title = c.req.query("job_title");
    const company = c.req.query("company");

    let sql = `
      SELECT ltj.*, lt.template_name
      FROM legacy_template_jobs ltj
      JOIN legacy_templates lt ON ltj.template_id = lt.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (q) {
      sql += " AND (ltj.duties LIKE ? OR ltj.job_title LIKE ? OR ltj.company LIKE ?)";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (job_title) {
      sql += " AND ltj.job_title LIKE ?";
      params.push(`%${job_title}%`);
    }
    if (company) {
      sql += " AND ltj.company LIKE ?";
      params.push(`%${company}%`);
    }

    sql += " ORDER BY ltj.date_from DESC";
    const rows = db.prepare(sql).all(...params);
    return c.json({ count: rows.length, jobs: rows });
  });

  // Get unique work history (deduplicated across templates)
  app.get("/jobs/unique", (c) => {
    const rows = db.prepare(`
      SELECT job_title, company, address, supervisor_name, supervisor_phone,
             date_from, date_to, hours_per_week, total_time_worked,
             duties, reason_for_leaving,
             GROUP_CONCAT(DISTINCT template_name) as used_in_templates
      FROM legacy_template_jobs ltj
      JOIN legacy_templates lt ON ltj.template_id = lt.id
      GROUP BY job_title, company, date_from
      ORDER BY date_from DESC
    `).all();
    return c.json({ count: rows.length, jobs: rows });
  });

  // Import a template (used by the seed script)
  app.post("/", async (c) => {
    const body = await c.req.json();
    const { template_name, template_index, jobs } = body;

    if (!template_name || !jobs) {
      return c.json({ error: "template_name and jobs are required" }, 400);
    }

    const insertTemplate = db.prepare(`
      INSERT INTO legacy_templates (template_name, template_index, job_count)
      VALUES (?, ?, ?)
    `);

    const insertJob = db.prepare(`
      INSERT INTO legacy_template_jobs (template_id, job_index, job_title, company, address,
        supervisor_name, supervisor_phone, hours_per_week, total_time_worked,
        date_from, date_to, duties, reason_for_leaving, currently_employed, raw_fields)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertTemplate.run(template_name, template_index || 0, jobs.length);
    const templateId = result.lastInsertRowid;

    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i].fields || jobs[i];
      insertJob.run(
        templateId, i,
        j["Job Title: *"] || j.job_title || "",
        j["Company/Agency:"] || j.company || "",
        j["Address:"] || j.address || "",
        j["Supervisor Name:"] || j.supervisor_name || "",
        j["Supervisor Phone:"] || j.supervisor_phone || "",
        j["Hours Per Week:"] || j.hours_per_week || "",
        j["Total Time Worked:"] || j.total_time_worked || "",
        j["From: **"] || j.date_from || "",
        j["To: **"] || j.date_to || "",
        j["Duties Performed:"] || j.duties || "",
        j["Reason for Leaving:"] || j.reason_for_leaving || "",
        j["Check if currently employed"] === "on" ? 1 : 0,
        JSON.stringify(j)
      );
    }

    return c.json({ id: templateId, message: `Template '${template_name}' imported with ${jobs.length} jobs` }, 201);
  });

  return app;
}
