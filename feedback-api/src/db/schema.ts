import Database from "better-sqlite3";
import { join } from "path";

const DB_PATH = process.env.FEEDBACK_DB_PATH || join(import.meta.dirname, "..", "..", "data", "feedback.db");

export function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initDb(db: Database.Database) {
  db.exec(`
    -- Core feedback entries from review cycles
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_control TEXT,
      classification TEXT,
      doc_type TEXT NOT NULL,          -- soq, resume, cover_letter, template
      section TEXT,                     -- which part of the document
      sentiment TEXT NOT NULL,          -- positive, negative, style, instruction
      content TEXT NOT NULL,            -- the actual feedback
      context TEXT,                     -- what was the original text that prompted this feedback
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Style rules extracted/synthesized from feedback
    CREATE TABLE IF NOT EXISTS style_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule TEXT NOT NULL,               -- "Use 'used' not 'utilized'"
      category TEXT NOT NULL,           -- tone, word_choice, formatting, structure, content
      scope TEXT DEFAULT 'universal',   -- universal, or a specific classification
      source_feedback_ids TEXT,         -- comma-separated feedback IDs this was derived from
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Brainstorm notes from pre-task conversations
    CREATE TABLE IF NOT EXISTS brainstorm_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_control TEXT NOT NULL,
      classification TEXT,
      highlights TEXT,                  -- what to emphasize
      avoid TEXT,                       -- what to downplay or skip
      notes TEXT,                       -- general conversation notes
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Track which applications used which feedback (for measuring improvement)
    CREATE TABLE IF NOT EXISTS application_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_control TEXT NOT NULL,
      classification TEXT,
      doc_type TEXT NOT NULL,
      revision_number INTEGER DEFAULT 1,
      feedback_ids_used TEXT,           -- which feedback entries informed this revision
      outcome TEXT,                     -- submitted, revised, abandoned
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Legacy CalCareers application templates (STD 678)
    CREATE TABLE IF NOT EXISTS legacy_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_name TEXT NOT NULL,
      template_index INTEGER,
      job_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Jobs within legacy templates
    CREATE TABLE IF NOT EXISTS legacy_template_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      job_index INTEGER NOT NULL,
      job_title TEXT,
      company TEXT,
      address TEXT,
      supervisor_name TEXT,
      supervisor_phone TEXT,
      hours_per_week TEXT,
      total_time_worked TEXT,
      date_from TEXT,
      date_to TEXT,
      duties TEXT,
      reason_for_leaving TEXT,
      currently_employed INTEGER DEFAULT 0,
      raw_fields TEXT,                    -- original JSON from CalCareers extraction
      FOREIGN KEY (template_id) REFERENCES legacy_templates(id)
    );

    -- Project summaries from research tasks
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo TEXT NOT NULL,                  -- e.g., 'bhope78/cc-dashboard'
      name TEXT NOT NULL,                  -- project name
      description TEXT,                    -- what it does
      tech_stack TEXT,                     -- JSON array of technologies
      role TEXT,                           -- Bryan's role in the project
      highlights TEXT,                     -- key achievements/features built
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(repo)
    );

    -- Skills evidence gathered from projects/work
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill TEXT NOT NULL,                 -- e.g., 'React', 'Cloudflare Workers', 'SQL'
      category TEXT NOT NULL,              -- technical, management, domain, soft_skill
      proficiency TEXT,                    -- beginner, intermediate, advanced, expert
      evidence TEXT,                       -- specific examples from projects
      source TEXT,                         -- where this was observed (repo, template, etc.)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Skill gap projects — things to build to strengthen weak areas
    CREATE TABLE IF NOT EXISTS skill_gap_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,                   -- project name to build
      description TEXT,                      -- what to build and why
      target_skills TEXT,                    -- JSON array of skills this would demonstrate
      target_classifications TEXT,           -- JSON array of job classifications this helps with
      job_control TEXT,                      -- specific job that revealed this gap
      priority TEXT DEFAULT 'medium',        -- low, medium, high, urgent
      status TEXT DEFAULT 'idea',            -- idea, in_progress, completed, abandoned
      notes TEXT,                            -- additional context
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Organization tech stacks — track what technologies each department uses
    CREATE TABLE IF NOT EXISTS org_tech_stacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department TEXT NOT NULL,              -- e.g., 'Department of Education', 'Covered California'
      tech TEXT NOT NULL,                    -- e.g., '.NET', 'Python', 'ServiceNow'
      context TEXT,                          -- where this was observed (job posting, duty statement, etc.)
      job_control TEXT,                      -- job that revealed this
      job_title TEXT,                        -- the position title
      confidence TEXT DEFAULT 'confirmed',   -- confirmed (from posting), inferred (from duty statement), rumored
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(department, tech)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_org_tech_dept ON org_tech_stacks(department);
    CREATE INDEX IF NOT EXISTS idx_org_tech_tech ON org_tech_stacks(tech);
    CREATE INDEX IF NOT EXISTS idx_skill_gap_status ON skill_gap_projects(status);
    CREATE INDEX IF NOT EXISTS idx_skill_gap_priority ON skill_gap_projects(priority);
    CREATE INDEX IF NOT EXISTS idx_feedback_classification ON feedback(classification);
    CREATE INDEX IF NOT EXISTS idx_feedback_doc_type ON feedback(doc_type);
    CREATE INDEX IF NOT EXISTS idx_feedback_sentiment ON feedback(sentiment);
    CREATE INDEX IF NOT EXISTS idx_feedback_job_control ON feedback(job_control);
    CREATE INDEX IF NOT EXISTS idx_brainstorm_job_control ON brainstorm_notes(job_control);
    CREATE INDEX IF NOT EXISTS idx_style_rules_scope ON style_rules(scope);
    CREATE INDEX IF NOT EXISTS idx_style_rules_active ON style_rules(active);
    CREATE INDEX IF NOT EXISTS idx_legacy_jobs_template ON legacy_template_jobs(template_id);
    CREATE INDEX IF NOT EXISTS idx_legacy_jobs_title ON legacy_template_jobs(job_title);
  `);
}
