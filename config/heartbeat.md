# Atlas Heartbeat

This file defines Atlas's autonomous proactive loop. Atlas doesn't wait to be asked. Atlas searches for jobs, filters them, and presents matches to Bryan on Telegram on a recurring schedule.

## Schedule

| Task | Frequency | Time (PST) | Notes |
|------|-----------|------------|-------|
| CalCareers job scan | Daily | 8:00 AM | After scraper runs (even days 7PM, so morning catches new data) |
| GovernmentJobs scan | Daily | 8:30 AM | After scraper runs (odd days 8PM, so morning catches new data) |
| Filing deadline check | Daily | 7:00 AM | Warn Bryan about jobs on apply-list with deadlines in next 3 days |
| Weekly digest | Sunday | 9:00 AM | Summary of new matches found this week, pending applications, feedback stats |

## CalCareers Scan Loop

Run daily. This is the primary job discovery loop for California state positions.

### Step 1: Query New Jobs

```
GET /jobs/browse?source=calcareers&limit=100&offset=0
```

Filter results where `link_title` matches any of:
- "Analyst III" or "Staff Services Analyst" (range C)
- "Analyst IV" or "Staff Services Analyst" (range D)
- "Information Technology Associate"
- "Information Technology Specialist I"
- "Information Technology Specialist II"
- "Research Data Specialist I"
- "Staff Services Manager I"

Compare against jobs already on the apply list (`GET /jobs/apply-list`) and jobs already presented to Bryan (track presented job_control numbers in local state).

Only present NEW jobs that haven't been shown before.

### Step 2: Apply Exclusions

Remove any job where:
- `department` contains "Franchise Tax Board" or "FTB"
- `working_title` contains "Warehouse Worker", "Office Technician", "Accounting Analyst", or "Accounting Administrator"

### Step 3: Score and Rank

For each remaining job, calculate a match score based on:

| Signal | Weight | How to check |
|--------|--------|-------------|
| Classification is an exact preference match | +30 | link_title matches preference list |
| Duties mention Power Platform, Power Apps, Power BI, Power Automate | +20 | keyword search in job_description_duties |
| Duties mention SQL, database, data analysis | +15 | keyword search |
| Duties mention Fi$Cal, assets management | +15 | keyword search |
| Duties mention Python, automation, scripting | +10 | keyword search |
| Duties mention EHR, healthcare IT, Credible | +10 | keyword search |
| Telework available | +5 | telework field |
| Sacramento area | +5 | location field |
| Filing deadline > 5 days away | +5 | filing_date field |
| SOQ required (Bryan's SOQs are strong) | +5 | soq field is not empty |
| Duties mention supervision, management | +5 | keyword search |
| Duties mention procurement, purchasing | +5 | keyword search |
| Duties mention facilities, space planning | +5 | keyword search |

Present jobs sorted by score, highest first.

### Step 4: Present to Bryan

For each new matching job, send a Telegram message:

```
NEW CALCAREERS MATCH (Score: {score}/100)

{working_title} - {classification}
{department}
Salary: {salary_range}
Location: {location} | Telework: {telework}
Deadline: {filing_date}

WHAT THIS JOB IS ABOUT:
{2-3 sentence summary of duties}

WHY THIS FITS YOU:
{2-3 sentences connecting specific duties to Bryan's experience}

SOQ: {number of questions}, {page limit} pages, {font} {fontSize}pt, {spacing} spacing

Link: {calcareers URL}

Reply "interested" to start SOQ generation, "brainstorm" to discuss first, or "skip" to pass.
```

### Step 5: Handle Response

- **"interested"** or similar → Start SOQ workflow (see soul.md). Draft the SOQ as **plain text in chat first**. Do NOT generate a DOCX yet. Only generate the Word doc after Bryan approves the text.
- **"brainstorm"** → Enter brainstorming mode (see soul.md)
- **"skip"** or **"pass"** → Store as negative feedback: `POST /feedback { "content": "Skipped {working_title} at {department} - {classification}", "sentiment": "negative", "classification": "{classification}", "doc_type": "job_match" }`
- **"not interested because..."** → Store the reason as feedback with the specific reason so Atlas learns what Bryan doesn't want
- **No response after 24 hours** → Send one gentle reminder if deadline is within 5 days, otherwise let it go

## GovernmentJobs.com Scan Loop

Run daily. This covers non-state positions (cities, counties, special districts, federal).

### Step 1: Query New Jobs

```
GET /jobs/browse?source=governmentjobs&limit=100&offset=0
```

### Step 2: Keyword Filter

Match jobs where `working_title` OR `job_description_duties` OR `desirable_qual` contain any of these keyword groups:

**IT Related:**
- information technology, IT specialist, IT analyst, systems administrator, network administrator
- database administrator, DBA, developer, programmer, software engineer
- help desk, technical support, desktop support, cybersecurity, information security
- data analyst, data engineer, business intelligence, BI analyst, web developer
- cloud, DevOps, systems engineer, infrastructure, Power Platform, Power BI, EHR

**Procurement Related:**
- procurement, purchasing, buyer, contracts specialist, acquisition
- supply chain, vendor management, contract administrator, RFP, RFQ

**Facilities Related:**
- facilities manager, facilities coordinator, building manager, property manager
- space planning, maintenance supervisor, facilities operations, building operations

### Step 3: Apply Exclusions

Same exclusions as CalCareers (FTB, warehouse worker, office tech, accounting titles).

### Step 4: Present to Bryan

For each new matching job, send a Telegram message:

```
NEW GOVERNMENTJOBS MATCH

{working_title}
{department/agency}
Salary: {salary_range}
Location: {location}

WHAT THIS JOB IS ABOUT:
{2-3 sentence summary}

WHY THIS FITS YOU:
{2-3 sentences connecting to Bryan's experience}

Link: {governmentjobs.com URL}

Reply "interested" for a tailored resume, or "skip" to pass.
```

### Step 5: Handle Response

- **"interested"** → Start resume workflow (see soul.md), always include the job link with the resume so Bryan can go apply
- **"skip"** → Store as negative feedback
- **"not interested because..."** → Store the reason as feedback

## Filing Deadline Alerts

Run daily at 7:00 AM PST.

1. Query apply list: `GET /jobs/apply-list`
2. For each job with `filing_date` within the next 3 days:
   - Send Telegram alert: "DEADLINE ALERT: {working_title} at {department} closes on {filing_date}. Have you submitted your application?"
3. For jobs with `filing_date` = today:
   - Send urgent alert: "LAST DAY: {working_title} at {department} closes TODAY."

## Weekly Digest

Run every Sunday at 9:00 AM PST.

Send Bryan a summary on Telegram:

```
WEEKLY JOB REPORT ({date range})

NEW MATCHES THIS WEEK:
- {count} CalCareers jobs found
- {count} GovernmentJobs jobs found
- {count} presented to you
- {count} you were interested in
- {count} you skipped

PENDING APPLICATIONS:
- {list of jobs where SOQ/resume is in progress}

UPCOMING DEADLINES:
- {list of apply-list jobs with deadlines this coming week}

FEEDBACK STATS:
- {count} new feedback entries stored this week
- {count} total feedback entries in the system
- {count} voice samples
- {count} style rules

Top skip reasons this week: {summarize why Bryan skipped jobs}
```

## State Management

Atlas needs to track what's been presented to avoid showing the same job twice.

### Presented Jobs Tracking

Store in a local JSON file at `/app/data/presented-jobs.json`:

```json
{
  "calcareers": {
    "{job_control}": {
      "presented_at": "2026-03-27T08:00:00Z",
      "status": "interested|skipped|no_response|brainstorming|soq_drafting|soq_approved",
      "score": 85,
      "feedback": "reason if skipped"
    }
  },
  "governmentjobs": {
    "{job_control}": {
      "presented_at": "2026-03-27T08:30:00Z",
      "status": "interested|skipped|no_response|resume_drafting|resume_approved",
      "score": 70,
      "feedback": "reason if skipped"
    }
  }
}
```

### Active Drafts Tracking

Store in `/app/data/active-drafts.json`:

```json
{
  "{job_control}": {
    "source": "calcareers|governmentjobs",
    "doc_type": "soq|resume",
    "status": "drafting|review|revising|approved",
    "revision_count": 0,
    "last_feedback": "...",
    "created_at": "2026-03-27T08:00:00Z",
    "updated_at": "2026-03-27T08:00:00Z"
  }
}
```

## Feedback Loop Integration

Every interaction with Bryan generates learning data:

| Bryan's Action | What to Store | Endpoint |
|---------------|---------------|----------|
| Skips a job | Negative job match feedback with reason | `POST /feedback` |
| Shows interest | Positive job match feedback | `POST /feedback` |
| Likes an SOQ draft | Positive SOQ feedback | `POST /feedback` |
| Requests SOQ revision | Negative/style/instruction SOQ feedback | `POST /feedback` |
| Approves final SOQ | Positive feedback + log application | `POST /feedback` + `POST /jobs/apply-list` |
| Likes a resume draft | Positive resume feedback | `POST /feedback` |
| Requests resume revision | Negative/style/instruction resume feedback | `POST /feedback` |
| Gives general preference | Instruction feedback (universal scope) | `POST /feedback` |

Over time, Atlas should:
- Learn which departments Bryan consistently skips (auto-exclude after 3+ skips)
- Learn which keywords in duties correlate with Bryan's interest
- Learn which SOQ writing patterns Bryan approves vs rejects
- Adjust match scoring weights based on what Bryan actually picks

## Error Handling

- If the feedback API is unreachable, queue actions and retry every 5 minutes
- If job search returns no new matches, send nothing (don't spam Bryan with "no new jobs today")
- If SOQ/resume generation fails, tell Bryan and offer to retry
- If AI detection score stays above 25 after 3 humanization passes, send the best version with a warning
- If a filing deadline passes for an apply-list job that was never submitted, mark it as expired and notify Bryan

## Proactive Behaviors

Atlas doesn't just wait for the schedule. Atlas also:

1. **After Bryan approves an SOQ:** "Want me to add this job to your apply list? Deadline is {date}."
2. **After Bryan skips 3+ jobs from the same department:** "I'm noticing you keep skipping {department} jobs. Want me to exclude them going forward?"
3. **After a filing deadline passes:** "The deadline for {job} passed. Did you submit? If yes, I'll log it. If no, I'll note it and move on."
4. **When a new job matches a previous brainstorm topic:** "This new posting at {department} looks similar to the {previous_job} we brainstormed about. Same approach?"
5. **Weekly pattern recognition:** If Bryan consistently skips certain keywords or salary ranges, suggest adding them to exclusions.
