/**
 * NextGen Tutoring — Quality Testing Worker
 * Worker Name: nextgen-quality-test
 *
 * Runs every Sunday at 6am EST via cron trigger
 * Tests AI-generated questions for quality across all grades/subjects
 * Saves results to Google Sheets + emails report
 *
 * Required Secrets (set in Cloudflare Worker Settings):
 *   ANTHROPIC_API_KEY   — your sk-ant- key
 *   RESEND_API_KEY      — from resend.com (free)
 *   SHEETS_TOKEN        — Google Sheets API service account token
 *   SHEETS_ID           — Google Sheet ID (from the URL)
 */

// ── SAMPLE TOPICS TO TEST (representative spread across all grades/subjects) ──
const TEST_TOPICS = [
  // MATH - K-2
  { subject:'math', grade:'K',   gradeLabel:'Kindergarten', topic:'Counting to 20',       category:'Counting & Numbers',       id:'count-20'  },
  { subject:'math', grade:'1st', gradeLabel:'1st Grade',    topic:'Addition within 20',   category:'Addition & Subtraction',   id:'add-20'    },
  { subject:'math', grade:'2nd', gradeLabel:'2nd Grade',    topic:'Addition within 100',  category:'Addition & Subtraction',   id:'add-100'   },
  // MATH - 3-5
  { subject:'math', grade:'3rd', gradeLabel:'3rd Grade',    topic:'Times Tables (1–10)',  category:'Multiplication & Division',id:'times-tables'},
  { subject:'math', grade:'4th', gradeLabel:'4th Grade',    topic:'Equivalent Fractions', category:'Fractions',                id:'frac-equiv' },
  { subject:'math', grade:'5th', gradeLabel:'5th Grade',    topic:'Unlike Denominators',  category:'Fractions',                id:'frac-unlike'},
  // MATH - 6-8
  { subject:'math', grade:'6th', gradeLabel:'6th Grade',    topic:'Ratios & Rates',       category:'Number Sense',             id:'ratios-6'   },
  { subject:'math', grade:'7th', gradeLabel:'7th Grade',    topic:'Two-Step Equations',   category:'Algebra',                  id:'two-step-7' },
  { subject:'math', grade:'8th', gradeLabel:'8th Grade',    topic:'Pythagorean Theorem',  category:'Geometry',                 id:'pythagorean'},
  // MATH - 9-12
  { subject:'math', grade:'9th', gradeLabel:'9th Grade',    topic:'Factoring',            category:'Polynomials & Quadratics', id:'factor-9'   },
  { subject:'math', grade:'10th',gradeLabel:'10th Grade',   topic:'Triangle Congruence',  category:'Triangles & Congruence',   id:'congruent-10'},
  { subject:'math', grade:'11th',gradeLabel:'11th Grade',   topic:'Quadratic Equations',  category:'Quadratics',               id:'quad-adv'   },
  { subject:'math', grade:'12th',gradeLabel:'12th Grade',   topic:'Unit Circle',          category:'Trigonometry',             id:'unit-circle'},
  // READING - varied grades
  { subject:'reading', grade:'K',   gradeLabel:'Kindergarten', topic:'Letter Sounds',       category:'Phonics',                id:'phonics-k'  },
  { subject:'reading', grade:'2nd', gradeLabel:'2nd Grade',    topic:'Main Idea & Details', category:'Comprehension',          id:'main-2'     },
  { subject:'reading', grade:'4th', gradeLabel:'4th Grade',    topic:'Making Inferences',   category:'Comprehension',          id:'infer-4'    },
  { subject:'reading', grade:'6th', gradeLabel:'6th Grade',    topic:'Central Idea & Details',category:'Comprehension',        id:'central-6'  },
  { subject:'reading', grade:'8th', gradeLabel:'8th Grade',    topic:'Analyzing Arguments', category:'Comprehension',          id:'argument-8' },
  { subject:'reading', grade:'10th',gradeLabel:'10th Grade',   topic:'Rhetorical Analysis', category:'Literary Analysis',      id:'rhetoric-10'},
  { subject:'reading', grade:'11th',gradeLabel:'11th Grade',   topic:'SAT Reading',         category:'Advanced Reading',       id:'ap-lit'     },
  // WRITING - varied grades
  { subject:'writing', grade:'1st', gradeLabel:'1st Grade',    topic:'Complete Sentences',  category:'Grammar',                id:'cap-1'      },
  { subject:'writing', grade:'3rd', gradeLabel:'3rd Grade',    topic:'Parts of Speech',     category:'Grammar',                id:'pos-3'      },
  { subject:'writing', grade:'5th', gradeLabel:'5th Grade',    topic:'Argumentative Writing',category:'Writing',               id:'argument-5' },
  { subject:'writing', grade:'7th', gradeLabel:'7th Grade',    topic:'Parallel Structure',  category:'Grammar & Mechanics',    id:'parallel-7' },
  { subject:'writing', grade:'9th', gradeLabel:'9th Grade',    topic:'SAT Writing',         category:'Writing',                id:'sat-write-9'},
  { subject:'writing', grade:'11th',gradeLabel:'11th Grade',   topic:'AP-Style Essays',     category:'Writing',                id:'ap-write'   },
  // SAT
  { subject:'sat', grade:'SAT', gradeLabel:'SAT/ACT', topic:'Heart of Algebra',      category:'SAT Math',              id:'sat-alg'    },
  { subject:'sat', grade:'SAT', gradeLabel:'SAT/ACT', topic:'Evidence-Based Reading', category:'SAT Reading',           id:'sat-read'   },
  { subject:'sat', grade:'SAT', gradeLabel:'SAT/ACT', topic:'Grammar & Conventions', category:'SAT Writing & Language', id:'sat-gram'   },
  { subject:'sat', grade:'SAT', gradeLabel:'SAT/ACT', topic:'ACT Math',              category:'ACT',                   id:'act-math'   },
];

// ── QUALITY CRITERIA ──
const QUALITY_CHECKS = {
  // Format checks
  validJson:        { weight: 20, label: 'Valid JSON format'          },
  allFieldsPresent: { weight: 15, label: 'All required fields present'},
  fourChoices:      { weight: 10, label: 'Exactly 4 answer choices'   },
  correctFieldValid:{ weight: 10, label: 'Correct field is A/B/C/D'   },
  // Content checks
  noEmojis:         { weight: 10, label: 'No emojis or symbols'       },
  questionLength:   { weight: 10, label: 'Question length appropriate'},
  choicesDistinct:  { weight: 10, label: 'All choices are distinct'   },
  explanationQuality:{ weight: 10, label: 'Explanation is substantive'},
  conceptPresent:   { weight:  5, label: 'Concept field present'      },
};

// ── MAIN HANDLER ──
export default {
  // Cron trigger — runs every Sunday at 6am UTC (1am EST)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runQualityTest(env));
  },

  // HTTP trigger — call manually to run immediately
  async fetch(request, env) {
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'GET only' }), { status: 405 });
    }
    const url = new URL(request.url);
    if (url.pathname === '/run-test') {
      const results = await runQualityTest(env);
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      status: 'NextGen Quality Test Worker',
      endpoints: { manual_run: '/run-test' },
      scheduled: 'Every Sunday at 6am UTC'
    }), { headers: { 'Content-Type': 'application/json' } });
  }
};

// ── RUN QUALITY TEST ──
async function runQualityTest(env) {
  const startTime = Date.now();
  const testDate  = new Date().toISOString().split('T')[0];
  const results   = [];
  let   totalScore = 0;

  console.log(`Starting quality test for ${TEST_TOPICS.length} topics...`);

  for (const topic of TEST_TOPICS) {
    console.log(`Testing: ${topic.gradeLabel} — ${topic.topic}`);
    const result = await testTopic(topic, env);
    results.push(result);
    totalScore += result.overallScore;
    // Small delay to avoid rate limiting
    await sleep(800);
  }

  const avgScore   = Math.round(totalScore / results.length);
  const passed     = results.filter(r => r.overallScore >= 80).length;
  const failed     = results.filter(r => r.overallScore < 60).length;
  const warnings   = results.filter(r => r.overallScore >= 60 && r.overallScore < 80).length;
  const duration   = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    date:        testDate,
    totalTopics: results.length,
    avgScore,
    passed,
    warnings,
    failed,
    duration,
    results,
  };

  // Save to Google Sheets
  if (env.SHEETS_SERVICE_ACCOUNT && env.SHEETS_ID) {
    await saveToSheets(summary, env);
  }

  // Send email report
  if (env.RESEND_API_KEY) {
    await sendEmailReport(summary, env);
  }

  return summary;
}

// ── TEST A SINGLE TOPIC ──
async function testTopic(topic, env) {
  const isYoung = ['K','1st','2nd'].includes(topic.grade);
  const is35    = ['3rd','4th','5th'].includes(topic.grade);

  const langNote = isYoung
    ? 'IMPORTANT: This is for very young students (K-2). Use SIMPLE words only. Short sentences. No complicated vocabulary.'
    : is35 ? 'This is for elementary students (grades 3-5). Use clear, friendly language.'
    : '';

  const prompt = `You are an expert ${topic.subject} curriculum designer for K-12 students.

Generate exactly 5 multiple choice ${topic.subject} questions for:
- Grade: ${topic.gradeLabel}
- Topic: ${topic.topic} (${topic.category})
- Subject: ${topic.subject}
${langNote}

Requirements:
- Each question has exactly 4 answer choices labeled A, B, C, D
- Exactly one correct answer per question
- Clear explanation of why the correct answer is right
- Include a "concept" field (1-2 sentences) — the key idea being tested
- Appropriate difficulty for ${topic.gradeLabel} students
- NEVER use emojis, emoji characters, or unicode symbols. Plain text only.
- Vary question types across the 5 questions

Return ONLY a JSON array, no markdown, no backticks:
[
  {
    "question": "question text",
    "choices": ["A) choice", "B) choice", "C) choice", "D) choice"],
    "correct": "A",
    "explanation": "explanation of correct answer",
    "concept": "brief key concept reminder"
  }
]`;

  let rawResponse   = '';
  let parseError    = null;
  let questions     = [];
  let generationMs  = 0;

  try {
    const t0  = Date.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 2000,
        system:     'You are an expert K-12 curriculum designer. Respond ONLY with valid JSON — no markdown, no backticks, no preamble.',
        messages:   [{ role: 'user', content: prompt }]
      })
    });

    generationMs = Date.now() - t0;
    const data   = await res.json();
    rawResponse  = data.content?.[0]?.text || '';
    const clean  = rawResponse.trim().replace(/```json|```/g, '').trim();
    questions    = JSON.parse(clean);
  } catch(e) {
    parseError = e.message;
  }

  // Run quality checks
  const checks  = runChecks(questions, rawResponse, parseError, topic.grade);
  const score   = calculateScore(checks);
  const issues  = getIssues(checks, questions);

  return {
    subject:      topic.subject,
    grade:        topic.grade,
    gradeLabel:   topic.gradeLabel,
    topic:        topic.topic,
    category:     topic.category,
    overallScore: score,
    status:       score >= 80 ? 'PASS' : score >= 60 ? 'WARN' : 'FAIL',
    generationMs,
    checks,
    issues,
    sampleQuestion: questions[0] || null,
    parseError,
  };
}

// ── QUALITY CHECKS ──
function runChecks(questions, rawResponse, parseError, grade) {
  const checks = {};

  // Valid JSON
  checks.validJson = !parseError && Array.isArray(questions) && questions.length > 0;

  if (!checks.validJson) {
    // All other checks fail if JSON is invalid
    Object.keys(QUALITY_CHECKS).forEach(k => { if (k !== 'validJson') checks[k] = false; });
    return checks;
  }

  // All required fields present
  checks.allFieldsPresent = questions.every(q =>
    q.question && q.choices && q.correct && q.explanation && q.concept
  );

  // Exactly 4 choices
  checks.fourChoices = questions.every(q =>
    Array.isArray(q.choices) && q.choices.length === 4
  );

  // Correct field is A/B/C/D
  checks.correctFieldValid = questions.every(q =>
    ['A','B','C','D'].includes(q.correct)
  );

  // No emojis — check for common emoji unicode ranges without the /u flag
  const allText = questions.map(q =>
    (q.question || '') + (q.choices || []).join('') + (q.explanation || '')
  ).join('');
  // Check for emoji by looking at char codes > 127000 (emoji range)
  let hasEmoji = false;
  for (let i = 0; i < allText.length; i++) {
    const code = allText.codePointAt(i);
    if (code > 127000) { hasEmoji = true; break; }
  }
  checks.noEmojis = !hasEmoji;

  // Question length appropriate (not too short or too long)
  const isYoung = ['K','1st','2nd'].includes(grade);
  const maxLen  = isYoung ? 150 : 400;
  const minLen  = isYoung ? 10  : 20;
  checks.questionLength = questions.every(q => {
    const len = (q.question || '').length;
    return len >= minLen && len <= maxLen;
  });

  // Choices are distinct (no duplicates)
  checks.choicesDistinct = questions.every(q => {
    const choices = (q.choices || []).map(c => c.replace(/^[A-D]\)\s*/,'').toLowerCase().trim());
    return new Set(choices).size === choices.length;
  });

  // Explanation is substantive (not just "The answer is X")
  checks.explanationQuality = questions.every(q => {
    const exp = (q.explanation || '').toLowerCase();
    return exp.length > 30 && !exp.match(/^the (correct )?answer is [a-d]\.?$/);
  });

  // Concept field present and substantive
  checks.conceptPresent = questions.every(q =>
    q.concept && q.concept.length > 15
  );

  return checks;
}

function calculateScore(checks) {
  let score = 0;
  let total = 0;
  for (const [key, cfg] of Object.entries(QUALITY_CHECKS)) {
    total += cfg.weight;
    if (checks[key]) score += cfg.weight;
  }
  return Math.round((score / total) * 100);
}

function getIssues(checks, questions) {
  const issues = [];
  for (const [key, passed] of Object.entries(checks)) {
    if (!passed) issues.push(QUALITY_CHECKS[key]?.label || key);
  }
  return issues;
}

// ── GOOGLE JWT AUTH ──
async function getGoogleToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encode = obj => btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Import private key
  const pemKey = sa.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const keyBuffer = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const jwt = `${signingInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

// ── SAVE TO GOOGLE SHEETS ──
async function saveToSheets(summary, env) {
  // Get fresh access token from service account JSON
  let accessToken;
  try {
    accessToken = await getGoogleToken(env.SHEETS_SERVICE_ACCOUNT);
  } catch(e) {
    console.error('Failed to get Google token:', e.message);
    return;
  }

  const rows = summary.results.map(r => [
    summary.date,
    r.gradeLabel,
    r.subject,
    r.topic,
    r.overallScore,
    r.status,
    r.generationMs,
    r.issues.join('; ') || 'None',
    r.parseError || '',
    r.sampleQuestion?.question?.substring(0, 100) || '',
  ]);

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEETS_ID}/values/Sheet1!A:J:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ values: rows }),
      }
    );
    const data = await res.json();
    console.log('Sheets save result:', data.updates?.updatedRows, 'rows added');
  } catch(e) {
    console.error('Sheets error:', e.message);
  }
}

// ── SEND EMAIL REPORT ──
async function sendEmailReport(summary, env) {
  const { date, totalTopics, avgScore, passed, warnings, failed, duration, results } = summary;

  const statusEmoji = avgScore >= 80 ? '✅' : avgScore >= 60 ? '⚠️' : '🚨';
  const statusWord  = avgScore >= 80 ? 'HEALTHY' : avgScore >= 60 ? 'NEEDS ATTENTION' : 'ACTION REQUIRED';

  // Build results table HTML
  const rowsHtml = results.map(r => {
    const color = r.status === 'PASS' ? '#1A5C38' : r.status === 'WARN' ? '#8B6914' : '#C0392B';
    const bg    = r.status === 'PASS' ? '#F0FFF4' : r.status === 'WARN' ? '#FFFBEB' : '#FFF5F5';
    return `<tr style="background:${bg};">
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${r.gradeLabel}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-transform:capitalize;">${r.subject}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${r.topic}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700;color:${color};">${r.overallScore}/100</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${color};font-weight:700;">${r.status}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${r.issues.length ? r.issues.join(', ') : '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#888;">${r.generationMs}ms</td>
    </tr>`;
  }).join('');

  // Failures detail
  const failures = results.filter(r => r.status === 'FAIL');
  const failDetail = failures.length ? `
    <h3 style="color:#C0392B;margin-top:24px;">Failed Topics — Action Required</h3>
    ${failures.map(r => `
      <div style="background:#FFF5F5;border:1px solid #FED7D7;border-radius:8px;padding:16px;margin-bottom:12px;">
        <strong>${r.gradeLabel} — ${r.subject} — ${r.topic}</strong><br/>
        <span style="color:#666;font-size:13px;">Score: ${r.overallScore}/100 | Issues: ${r.issues.join(', ')}</span>
        ${r.parseError ? `<br/><span style="color:#C0392B;font-size:12px;">Parse error: ${r.parseError}</span>` : ''}
        ${r.sampleQuestion ? `<br/><br/><em style="font-size:13px;color:#444;">Sample: "${r.sampleQuestion.question?.substring(0,120)}..."</em>` : ''}
      </div>
    `).join('')}
  ` : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:'DM Sans',Arial,sans-serif;background:#F8F6F0;margin:0;padding:24px;">
  <div style="max-width:800px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#112240;padding:32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">${statusEmoji}</div>
      <h1 style="color:#C9A84C;font-size:22px;margin:0 0 4px;">NextGen Tutoring</h1>
      <p style="color:rgba(255,255,255,0.6);margin:0;font-size:14px;">Weekly Quality Report — ${date}</p>
    </div>

    <!-- Summary Cards -->
    <div style="display:flex;gap:0;border-bottom:1px solid #eee;">
      <div style="flex:1;padding:24px;text-align:center;border-right:1px solid #eee;">
        <div style="font-size:36px;font-weight:700;color:#112240;">${avgScore}</div>
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Avg Score</div>
      </div>
      <div style="flex:1;padding:24px;text-align:center;border-right:1px solid #eee;">
        <div style="font-size:36px;font-weight:700;color:#1A5C38;">${passed}</div>
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Passed</div>
      </div>
      <div style="flex:1;padding:24px;text-align:center;border-right:1px solid #eee;">
        <div style="font-size:36px;font-weight:700;color:#8B6914;">${warnings}</div>
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Warnings</div>
      </div>
      <div style="flex:1;padding:24px;text-align:center;">
        <div style="font-size:36px;font-weight:700;color:#C0392B;">${failed}</div>
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Failed</div>
      </div>
    </div>

    <!-- Status Banner -->
    <div style="padding:16px 32px;background:${avgScore >= 80 ? '#F0FFF4' : avgScore >= 60 ? '#FFFBEB' : '#FFF5F5'};border-bottom:1px solid #eee;text-align:center;">
      <strong style="color:${avgScore >= 80 ? '#1A5C38' : avgScore >= 60 ? '#8B6914' : '#C0392B'};">
        Platform Status: ${statusWord}
      </strong>
      <span style="color:#888;font-size:13px;margin-left:8px;">— ${totalTopics} topics tested in ${duration}s</span>
    </div>

    <!-- Results Table -->
    <div style="padding:24px 32px;">
      <h3 style="color:#112240;margin-top:0;">Full Results</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#112240;color:#C9A84C;">
            <th style="padding:10px 12px;text-align:left;">Grade</th>
            <th style="padding:10px 12px;text-align:left;">Subject</th>
            <th style="padding:10px 12px;text-align:left;">Topic</th>
            <th style="padding:10px 12px;text-align:left;">Score</th>
            <th style="padding:10px 12px;text-align:left;">Status</th>
            <th style="padding:10px 12px;text-align:left;">Issues</th>
            <th style="padding:10px 12px;text-align:left;">Speed</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      ${failDetail}

      <div style="margin-top:24px;padding:16px;background:#F8F6F0;border-radius:8px;font-size:12px;color:#888;">
        <strong>Score Guide:</strong> 80-100 = Pass &nbsp;|&nbsp; 60-79 = Warning &nbsp;|&nbsp; 0-59 = Fail<br/>
        <strong>Checks:</strong> JSON format, all fields present, 4 choices, no emojis, question length, distinct choices, explanation quality, concept present<br/>
        This report runs automatically every Sunday at 6am. View full logs in your <a href="https://docs.google.com/spreadsheets/d/${env.SHEETS_ID}" style="color:#112240;">Google Sheet</a>.
      </div>
    </div>

  </div>
</body>
</html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'NextGen Quality Bot <reports@nextgentutoring.org>',
        to:      ['nextgentutoringco@gmail.com'],
        subject: `${statusEmoji} NextGen Quality Report — ${date} — Avg Score: ${avgScore}/100`,
        html,
      }),
    });
    const data = await res.json();
    console.log('Email sent:', data.id);
  } catch(e) {
    console.error('Email error:', e.message);
  }
}

// ── HELPER ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }