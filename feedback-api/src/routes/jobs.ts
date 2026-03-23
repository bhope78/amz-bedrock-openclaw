import { Hono } from "hono";

const D1_DATABASE_ID = "f9fe4ade-a55b-4600-bf24-64172903c2c6";
const CF_ACCOUNT_ID = "a2d15074d39d49779729f74c83fc8189";

async function queryD1(sql: string, params: any[] = []): Promise<any[]> {
  // Read the wrangler OAuth token (auto-refreshed by wrangler)
  const configPath = `${process.env.HOME}/Library/Preferences/.wrangler/config/default.toml`;
  const { readFileSync } = await import("fs");
  const config = readFileSync(configPath, "utf-8");
  const tokenMatch = config.match(/oauth_token\s*=\s*"([^"]+)"/);
  if (!tokenMatch) throw new Error("No wrangler OAuth token found");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenMatch[1]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );

  const data = await res.json() as any;
  if (!data.success) throw new Error(data.errors?.[0]?.message || "D1 query failed");
  return data.result?.[0]?.results || [];
}

export function jobsRoutes() {
  const app = new Hono();

  // Get apply list — all saved jobs with full details
  app.get("/apply-list", async (c) => {
    try {
      const rows = await queryD1(`
        SELECT al.id as apply_list_id, al.status, al.notes, al.created_at as added_at,
               j.id, j.job_control, j.working_title, j.link_title, j.department,
               j.location, j.salary_range, j.telework, j.filing_date, j.publish_date,
               j.soq, j.soq_questions, j.soq_format, j.soq_question_count,
               j.desirable_qual, j.job_description_duties, j.special_requirements,
               j.application_instructions, j.contact_info, j.job_posting_url,
               j.duty_statement
        FROM apply_list al
        JOIN ccJobs j ON al.job_id = j.id
        ORDER BY al.created_at DESC
      `);
      return c.json({ count: rows.length, jobs: rows });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Get a specific job by job_control
  app.get("/by-control/:job_control", async (c) => {
    const job_control = c.req.param("job_control");
    try {
      const rows = await queryD1(
        "SELECT * FROM ccJobs WHERE job_control = ? LIMIT 1",
        [job_control]
      );
      if (rows.length === 0) return c.json({ error: "Job not found" }, 404);
      return c.json(rows[0]);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Search jobs
  app.get("/search", async (c) => {
    const q = c.req.query("q") || "";
    const limit = parseInt(c.req.query("limit") || "20");
    try {
      const rows = await queryD1(
        `SELECT id, job_control, working_title, link_title, department,
                location, salary_range, filing_date, soq_question_count
         FROM ccJobs
         WHERE working_title LIKE ? OR department LIKE ? OR job_control LIKE ? OR link_title LIKE ?
         ORDER BY publish_date DESC LIMIT ?`,
        [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit]
      );
      return c.json({ count: rows.length, jobs: rows });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Add to apply list
  app.post("/apply-list", async (c) => {
    const body = await c.req.json();
    const { job_control, notes, status } = body;

    if (!job_control) return c.json({ error: "job_control required" }, 400);

    try {
      // Find job ID
      const jobs = await queryD1(
        "SELECT id FROM ccJobs WHERE job_control = ? LIMIT 1",
        [job_control]
      );
      if (jobs.length === 0) return c.json({ error: `Job ${job_control} not found` }, 404);

      await queryD1(
        "INSERT OR IGNORE INTO apply_list (job_id, job_control, notes, status) VALUES (?, ?, ?, ?)",
        [jobs[0].id, job_control, notes || null, status || "interested"]
      );

      return c.json({ message: "Added to apply list", job_control }, 201);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  // Remove from apply list
  app.delete("/apply-list/:job_control", async (c) => {
    const job_control = c.req.param("job_control");
    try {
      await queryD1("DELETE FROM apply_list WHERE job_control = ?", [job_control]);
      return c.json({ message: "Removed from apply list" });
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  return app;
}
