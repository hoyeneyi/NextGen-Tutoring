# CLAUDE.md — NextGen Tutoring Platform
**Read this entire file before touching a single line of code.**
**This is the source of truth for every session.**

---

## WHO WE ARE

NextGen Tutoring is a Metro Detroit tutoring business built by Hafeez (hoyeneyi).
It is NOT a side project. It is a scaling EdTech platform with real students, real parents, and real sessions happening weekly.

**Mission:** Make high-quality, personalized tutoring accessible — and back it with technology that makes every student feel like they have a private tutor built for them.

**Standard:** Everything we build should feel like it belongs alongside Khan Academy, IXL, and Duolingo — not a weekend project. If it looks or feels cheap, rebuild it.

---

## TECH STACK

| Layer | Tool |
|---|---|
| Hosting | GitHub Pages (`hoyeneyi/NextGen-Tutoring`) |
| Auth + DB | Firebase (Firestore + Firebase Auth) |
| AI Proxy | Cloudflare Worker (`nextgen-proxy.nextgentutoringco.workers.dev`) |
| Calendar Sync | Cloudflare Worker (`nextgen-calendar-worker.nextgentutoringco.workers.dev`) |
| AI Model | `claude-haiku-4-5-20251001` via Anthropic API |
| PDF Generation | Claude Code → GitHub Pages → Firestore URL sync |
| Forms | Formspree |
| Scheduling | Calendly |
| Automation | Make.com (planned) |
| CRM | Airtable (planned) |
| Payments | Stripe (planned) |

**No frameworks. No React. No build tools on the frontend.**
Vanilla JS, HTML, CSS only. Keep it deployable via GitHub Pages without a build step.

---

## REPO STRUCTURE

```
NextGen-Tutoring/
├── index.html                    # Homepage (public marketing site)
├── pages/
│   ├── dashboard.html            # Student dashboard — CORE FILE
│   ├── login.html                # Auth page
│   ├── signup.html               # Registration
│   ├── about.html
│   └── contact.html
├── assets/
│   └── images/
├── components/                   # Shared HTML components
├── scripts/                      # JS modules
├── styles/                       # CSS
├── pdfs/                         # Generated student PDFs (committed by Claude Code)
├── nextgen-proxy-worker.js       # Cloudflare Worker source (deploy separately)
├── sw.js                         # Service worker
├── firebase.json
├── CNAME                         # nextgentutoring.org
└── CLAUDE.md                     # This file
```

---

## DESIGN SYSTEM

**Brand Colors:**
- Navy: `#0a1628` (primary background, headers)
- Gold: `#c9a84c` (accents, CTAs, highlights)
- White: `#ffffff`
- Light gray: `#f5f5f5` (card backgrounds)
- Text: `#1a1a2e`

**Typography:**
- Headings: strong, bold, professional
- Body: clean, readable, minimum 16px on mobile
- No decorative fonts — this is an academic platform

**Design Standard:**
- Mobile-first always — most parents and students are on phones
- Cards with subtle shadow, rounded corners (8–12px)
- No emoji in UI chrome — only in question content where educationally appropriate
- Every interactive element needs a hover/active state
- Loading states required on every async operation — never leave the user staring at a blank screen

---

## FIREBASE SETUP

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDcE_rQ_Q6PnsA9uSlkOytVz70-t_ZzQNA",
  authDomain: "nextgen-tutoring.firebaseapp.com",
  projectId: "nextgen-tutoring",
  storageBucket: "nextgen-tutoring.appspot.com",
  messagingSenderId: "1064020614361",
  appId: "1:1064020614361:web:4a88beaf6765b23c59f2c8"
};
```

**Firestore Collections:**
- `users/{uid}` — student profile, grade, subjects
- `sessions/{id}` — tutoring session records
- `homework/{id}` — generated PDF URLs per student
- `practice/{uid}/results` — practice session scores and history
- `bookings/{id}` — booking requests (name, email, phone, grade, subject, sessionType, message, requestedDate, requestedTime, location:{id,name,address}, frequency, isRecurring, recurringGroup, sessionIndex, totalSessions, recurringOngoing, status, createdAt, confirmedAt, googleCalendarLink)

---

## CLOUDFLARE WORKER (AI PROXY)

**URL:** `https://nextgen-proxy.nextgentutoringco.workers.dev`
**Model:** `claude-haiku-4-5-20251001`
**Status:** Deployed, healthy, 0 errors

The Worker passes the request body straight through to Anthropic.
The dashboard sends the full API payload — model, system, messages — to the Worker.
The Worker injects the API key server-side. Never put the API key in frontend code.

**Allowed origins:**
- `https://nextgentutoring.org`
- `https://www.nextgentutoring.org`
- `http://localhost`
- `http://127.0.0.1`

**Call pattern from dashboard:**
```javascript
const response = await fetch('https://nextgen-proxy.nextgentutoringco.workers.dev', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  })
});
```

**Always handle errors gracefully — never show raw error text to students.**

---

## CLOUDFLARE WORKER (GOOGLE CALENDAR SYNC)

**File:** `nextgen-calendar-worker.js` (deploy separately via Wrangler)
**URL:** `https://nextgen-calendar-worker.nextgentutoringco.workers.dev`
**Status:** Source committed, not yet deployed

**Required secrets (set via `wrangler secret put`):**
- `GOOGLE_SERVICE_ACCOUNT_KEY` — full JSON string of the Google service account key
- `CALENDAR_ID` — target calendar (hoyeneyi@umich.edu)

**Routes:**
- `POST /create-event` — creates a real Google Calendar event; returns `{ eventId, htmlLink }`
- `POST /check-availability` — checks if a window is free; returns `{ available, conflicts }`
- `GET /events?date=YYYY-MM-DD` — returns events for a date (used by booking page to block slots)

**Auth:** RS256 JWT signed with the service account private key, exchanged for a Google OAuth2 access token. Scope: `https://www.googleapis.com/auth/calendar`

**Integration points:**
- `booking.html` — `pickDate()` calls `GET /events?date=…` to block calendar-occupied slots. Fails gracefully if worker is down.
- `admin.html` — `confirmBooking()` calls `POST /create-event` to create the real event; falls back to the template URL if the worker is unavailable. Stores the returned `htmlLink` in Firestore.

---

## PRACTICE SYSTEM — ARCHITECTURE

The practice system lives inside `pages/dashboard.html`.

**Flow:**
1. Student selects grade → subject → topic
2. `buildPrompt()` constructs a precise AI prompt
3. Dashboard POSTs to Cloudflare Worker
4. Worker calls Anthropic, returns JSON
5. Dashboard parses and renders 5 questions
6. Student answers → immediate feedback → score tracked
7. Results saved to Firestore

**Question JSON schema (what the AI must return):**
```json
{
  "questions": [
    {
      "id": 1,
      "standard": "K.CC.4",
      "question": "question text here",
      "choices": {
        "A": "option A",
        "B": "option B",
        "C": "option C",
        "D": "option D"
      },
      "correct": "B",
      "explanation": "Why B is correct, explained at grade level"
    }
  ]
}
```

**Non-negotiable prompt rules:**
1. Never state the answer in the question stem
2. Wrong choices must be plausible (not obviously wrong)
3. Language must match the grade level exactly
4. Use emojis to represent objects visually for K–2 (no external images)
5. Every question must map to a specific CCSS standard
6. Explanation must be written at the student's grade level
7. Always return valid JSON — no markdown, no backticks, no preamble

---

## QUESTION DESIGN PRINCIPLES

These apply permanently to every grade, every session, every topic.

1. **Template-based generation only.** The AI fills variables into structured question types (Type A–E defined in `buildPrompt()`). It never freely invents question format. This prevents lazy, generic, or pattern-based questions.

2. **Wrong answers must reflect real student misconceptions**, not random nearby numbers. Examples:
   - Counting: off-by-one errors (skipping a count, double-counting)
   - Addition: adding only one operand, reversing the operation
   - Reading: visually similar letters, character/event confusion, wrong meaning in context

3. **Never generate a sequence in the question stem.** Do not write "3, 4, 5, ___" and ask what comes next. Ask about the concept directly: "What number comes after 5?"

4. **Every question must require genuine thinking.** A student cannot answer correctly by reading the stem for context clues or by scanning the choices for obvious patterns.

5. **The derivability test.** Before finalizing any question, apply this check: *"Could a student answer this correctly without understanding the concept?"* If yes — regenerate the question.

6. **Variety is required.** No two questions in the same session may use the same template type AND the same scenario. Rotate types (A, B, C, D, E) across the 5 questions.

7. **Reference standard: IXL and Khan Academy.** Questions must meet the specificity bar set by those platforms — skill-targeted, clearly worded, genuinely challenging at grade level. If a question would feel at home on either platform, it passes. If it feels like a lazy placeholder, regenerate it.

---

## CURRICULUM STANDARD

**All curriculum is aligned to Common Core State Standards (CCSS).**
Every topic must include its CCSS standard code (e.g. `K.CC.1`, `3.OA.7`, `5.NBT.2`).

**Grade rollout order (build chronologically, one grade at a time):**
K → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → Pre-Algebra → Algebra 1 → Geometry → Algebra 2 → Pre-Calc → Statistics → Calculus

**Subjects per grade:**
- K–5: Math, ELA (Reading + Writing combined)
- 6–8: Math, ELA, Science (planned), Social Studies (planned)
- HS: Math (by course), ELA, SAT/ACT Prep
- Special: MCOLES (law enforcement exam prep)

**Mastery system:**
- Each topic has 3 difficulty bands: Foundation → Application → Challenge
- Student must score 70%+ to pass, 90%+ for mastery
- SmartScore tracks progress and adapts difficulty

---

## ACTIVE STUDENTS (as of May 2026)

| Student | Rate | Schedule | Notes |
|---|---|---|---|
| Navon | $40 | Sun + Wed | Needs chunked pacing, extra processing time, no time pressure |
| Andrew | $40 | Tue | Above grade level |
| Justin | prepaid 5-pack | renewal due | |
| Kadence/Tre | $50 | Wed | |
| William | $50 | Sat | Milestone-only framing — zero grade language |
| Zion | $40 | Sat | Confidence-first approach |
| Mayomi | $300/10-pack | 8 remaining | |
| Nadia | $30 | TBD | |
| Natasha | TBD | TBD | MCOLES prep, dyslexia |
| Angie | $35 | TBD | |

**New student minimum rate: $85+**

---

## INNOVATION STANDARDS

This platform should stay ahead of the curve. When building features, consider:

- **Adaptive difficulty** — questions should get harder as students succeed, easier when they struggle. Never serve the same difficulty twice in a row if the student is struggling.
- **Spaced repetition** — topics a student got wrong should resurface in future sessions
- **Progress visualization** — students and parents should be able to SEE improvement over time, not just see a score
- **Mastery-based progression** — students don't move on until they've demonstrated mastery, not just completion
- **Parent visibility** — parents should receive session summaries automatically
- **Voice/audio** (future) — K–2 students benefit from audio questions, not just text
- **Gamification** — streaks, badges, and milestones increase engagement without cheapening the academic brand

**AI trends to leverage:**
- Structured outputs (JSON schema enforcement) for reliable question generation
- Multi-turn conversation for Socratic tutoring mode (future)
- Retrieval-augmented generation for curriculum-specific content
- Personalization based on past performance stored in Firestore

---

## CODE STANDARDS

1. **Read before you write** — always read the full relevant file before editing anything
2. **One feature at a time** — never rebuild multiple systems in one commit
3. **Test the happy path AND the error path** — what happens when the API fails?
4. **Mobile first** — test at 390px width before declaring anything done
5. **No inline styles** — use CSS classes
6. **Comment complex logic** — future sessions need to understand the intent
7. **Commit messages** — be specific: `fix: K.CC.4 counting questions now use emoji objects` not `update`
8. **Never break what's working** — if something is functional, isolate your changes

---

## CURRENT STATUS (May 2026)

### Working:
- Login/auth (Firebase) — email/password + Google Sign In
- Student dashboard shell
- Homework loop (PDF gen → GitHub Pages → Firestore)
- Admin portal (overview, students, notes, homework, bookings)
- Cloudflare Worker proxy (healthy, 0 errors)
- Kindergarten CCSS curriculum (QA complete — K.CC, K.OA, K.NBT, K.MD, K.G, K.RF, K.RI, K.RL, K.W)
- 1st grade CCSS curriculum (17 Math + 15 ELA topics, QA in progress)
- Practice session results saved to Firestore with topic progress indicators
- Topic progress indicators refresh on grid re-render after session
- Native booking system (pages/booking.html) — location selector (5 libraries + virtual + other), calendar (location-aware, Dearborn Sundays blocked), time slots (library hours + async buffer logic from Firestore), recurring sessions (weekly/bi-weekly, 4/8/12/ongoing, schedule preview), Firestore save
- Admin booking management — pending/confirmed/declined, Google Calendar event creation via worker (falls back to template URL), confirmation email (pre-filled mailto)
- All "Book a Session" buttons across index.html and dashboard.html link to native booking page

### Broken / Needs Work:
- Firestore rules must be deployed — REMINDER: run `firebase deploy --only firestore:rules` or paste into Firebase Console. Now includes bookings collection rules.
- Calendar worker (`nextgen-calendar-worker.js`) must be deployed via `wrangler deploy` and secrets set (`GOOGLE_SERVICE_ACCOUNT_KEY`, `CALENDAR_ID`). Booking page and admin degrade gracefully until deployed.
- Formspree endpoint in booking.html needs a real form ID (placeholder: YOUR_FORMSPREE_ID)
- No difficulty bands per topic
- No spaced repetition
- No parent portal
- No progress tracking visualization

### In Progress:
- 1st grade QA
- Phase 2 multi-tutor architecture
- Stripe billing integration
- Make.com automation

---

## SESSION PROTOCOL

At the start of every Claude Code session:
1. Read this file
2. Read the specific file(s) you're about to touch
3. State what you're going to change before changing it
4. Make the change
5. Verify it doesn't break adjacent functionality
6. Commit with a specific message
7. Push

**Never assume. Always read first.**
