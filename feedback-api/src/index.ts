import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { mkdirSync } from "fs";
import { join } from "path";
import { getDb, initDb } from "./db/schema.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { styleRulesRoutes } from "./routes/style-rules.js";
import { brainstormRoutes } from "./routes/brainstorm.js";
import { applicationRoutes } from "./routes/applications.js";
import { legacyTemplateRoutes } from "./routes/legacy-templates.js";
import { jobsRoutes } from "./routes/jobs.js";
import { projectsRoutes } from "./routes/projects.js";
import { skillsRoutes } from "./routes/skills.js";
import { skillGapsRoutes } from "./routes/skill-gaps.js";
import { orgTechRoutes } from "./routes/org-tech.js";

// Ensure data directory exists
mkdirSync(join(import.meta.dirname, "..", "data"), { recursive: true });

const db = getDb();
initDb(db);

const app = new Hono();

// CORS for OpenClaw or any external client
app.use("*", cors());

// Health check
app.get("/", (c) => {
  const stats = {
    service: "career-feedback-api",
    status: "ok",
    feedback_count: (db.prepare("SELECT COUNT(*) as count FROM feedback").get() as any).count,
    style_rules_count: (db.prepare("SELECT COUNT(*) as count FROM style_rules WHERE active = 1").get() as any).count,
    brainstorm_count: (db.prepare("SELECT COUNT(*) as count FROM brainstorm_notes").get() as any).count,
    legacy_template_count: (db.prepare("SELECT COUNT(*) as count FROM legacy_templates").get() as any).count,
    project_count: (db.prepare("SELECT COUNT(*) as count FROM projects").get() as any).count,
    skill_count: (db.prepare("SELECT COUNT(*) as count FROM skills").get() as any).count,
  };
  return c.json(stats);
});

// Composite endpoint: get everything relevant for generating a document
// This is the main endpoint Claude Code calls before writing an SOQ/resume
app.get("/context/:classification", (c) => {
  const classification = c.req.param("classification");
  const doc_type = c.req.query("doc_type") || "soq";
  const job_control = c.req.query("job_control");

  // Get relevant feedback for this classification
  const feedback = db.prepare(`
    SELECT * FROM feedback
    WHERE (classification = ? OR classification IS NULL)
    AND (doc_type = ? OR doc_type = 'general')
    ORDER BY created_at DESC LIMIT 30
  `).all(classification, doc_type);

  // Get universal + classification-specific style rules
  const styleRules = db.prepare(`
    SELECT * FROM style_rules
    WHERE active = 1 AND (scope = 'universal' OR scope = ?)
    ORDER BY category
  `).all(classification);

  // Get brainstorm notes for this specific job if provided
  let brainstormNotes: any[] = [];
  if (job_control) {
    brainstormNotes = db.prepare(
      "SELECT * FROM brainstorm_notes WHERE job_control = ? ORDER BY created_at DESC"
    ).all(job_control);
  }

  // Get past brainstorm notes for this classification (for patterns)
  const pastNotes = db.prepare(`
    SELECT * FROM brainstorm_notes
    WHERE classification = ? AND job_control != COALESCE(?, '')
    ORDER BY created_at DESC LIMIT 10
  `).all(classification, job_control);

  return c.json({
    classification,
    doc_type,
    job_control,
    feedback: { count: feedback.length, entries: feedback },
    style_rules: { count: styleRules.length, rules: styleRules },
    brainstorm_notes: { current: brainstormNotes, past: pastNotes },
  });
});

// Mount routes
app.route("/feedback", feedbackRoutes(db));
app.route("/style-rules", styleRulesRoutes(db));
app.route("/brainstorm", brainstormRoutes(db));
app.route("/applications", applicationRoutes(db));
app.route("/legacy-templates", legacyTemplateRoutes(db));
app.route("/jobs", jobsRoutes());
app.route("/projects", projectsRoutes(db));
app.route("/skills", skillsRoutes(db));
app.route("/skill-gaps", skillGapsRoutes(db));
app.route("/org-tech", orgTechRoutes(db));

const port = parseInt(process.env.FEEDBACK_API_PORT || "3456");

serve({ fetch: app.fetch, port }, () => {
  console.log(`Career Feedback API running on http://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
