/**
 * NextGen Tutoring — Quality Testing Worker  v2.0
 * Worker Name: nextgen-quality-test
 *
 * Cron: Sunday 6am UTC (1am EST)   |   HTTP: GET /run-test
 *
 * STAGE 1 — Generation  : claude-sonnet-4-6, using the EXACT prompt-construction
 *                          logic from dashboard.html (getQuestionTemplates +
 *                          buildQuestionPrompt). Topics use real curriculum IDs.
 * STAGE 2 — Format checks: pure JS, unchanged.
 * STAGE 3 — Correctness  : claude-opus-4-8 evaluates standard match, answer
 *                          correctness, unique answer, explanation accuracy,
 *                          and distractor grounding — one batch call per topic.
 *
 * Required secrets (Cloudflare Worker Settings):
 *   ANTHROPIC_API_KEY      — sk-ant- key
 *   RESEND_API_KEY         — resend.com key
 *   SHEETS_SERVICE_ACCOUNT — Google service account JSON string (Sheets write)
 *   SHEETS_ID              — Google Sheet ID (from URL)
 */

// ── EXACT COPY OF getQuestionTemplates() FROM dashboard.html ─────────────────
// Constrains generation to fill typed slots instead of freely inventing format.
function getQuestionTemplates(subject, theme, topicName, topicCategory) {

  if (theme === 'k2' && subject === 'math') {
    return `
QUESTION TYPE TEMPLATES — assign a type to each of the 5 questions (vary types; max 2 of the same type):

TYPE A — Count and Identify:
  Format: "Here are some [objects]: [EMOJIS]. How many [objects] are there?"
  • Objects: 2–9; use one clear emoji per question (🍎 🐶 ⭐ 🎈 🐸 🏠 ✏️ 🌈 🐱 🎒 🌟 🍭 🦋 🐥)
  • Wrong choices must represent real counting errors:
    – N−1 (student skipped one object while counting)
    – N+1 (student double-counted one object)
    – A number 2+ away (lost their place entirely)

TYPE B — Before or After a Number (NEVER show a sequence):
  Format: "What number comes right [after / before] [N]?"
  • N range: 1–20 for Kindergarten; 1–30 for 1st grade; alternate after/before across questions
  • NEVER write "3, 4, 5, ___" or any fill-in sequence — ask about one number directly
  • Wrong choices: N+2 (skipped), N−2 (wrong direction), a non-adjacent number like N+5

TYPE C — Compare Two Groups:
  Format: "Which group has MORE?\\nGroup A: [EMOJIS]\\nGroup B: [EMOJIS]"
  • Groups differ by 1–3 objects; each group has 2–8 objects total
  • Wrong choices: "Group B" (if A correct), "They have the same amount", "You can't tell"

TYPE D — Real World Scenario:
  Format: "[Child name] has [N] [objects + emoji]. [He/She] [gets M more / gives away M]. How many now?"
  • Child names: Maya, Liam, Zoe, Kai, Sofia, Ethan, Amir, Nadia (vary across questions)
  • Kindergarten total ≤ 10; 1st grade total ≤ 20
  • Wrong choices: just N (forgot the action), just M (used only the change), N + M + 1 (off-by-one)

TYPE E — True or False Equation (1st grade OA topics only):
  Format: "Is this true or false?  [N] + [M] = [RESULT]"
  • Make one clearly true, one clearly false; add C) and D) as nearby false equations so it is not 50/50
  • Use simple numbers; wrong choices are off-by-one results`;
  }

  if (theme === 'k2' && (subject === 'reading' || subject === 'writing')) {
    return `
QUESTION TYPE TEMPLATES — assign a type to each of the 5 questions (vary types):

TYPE A — Key Detail from a Mini-Passage:
  Write 2–3 sentences at Kindergarten/1st-grade level. Ask: "What did [character] do?" or "Where did this happen?"
  Wrong choices: plausible but wrong — swap character names, change the action or setting

TYPE B — Vocabulary in Context:
  One sentence with a target word. "What does [word] mean in this sentence?"
  Wrong choices: a different meaning the word can have, a word that looks/sounds similar, a related but wrong concept

TYPE C — Rhyme / Word Family (Foundational Skills topics):
  "Which word rhymes with [TARGET]?"
  Wrong choices: words that visually look like they should rhyme (e.g., "comb / bomb"), or share the first letter

TYPE D — Phonics Pattern (RF topics):
  "Which word has the [short-A / long-E / -at family / consonant blend] sound?"
  Wrong choices: words with a similar-looking but different vowel pattern; never make it obvious from spelling

TYPE E — Sentence Mechanics (Writing/Language topics):
  "Which sentence is written correctly?"
  Show 4 versions: one correct, one missing a capital, one wrong end punctuation, one grammar error`;
  }

  if (theme === '35' && subject === 'math') {
    return `
QUESTION TYPE TEMPLATES — assign a type to each of the 5 questions (vary types):

TYPE A — Direct Computation (requires actual calculation — no hint in the stem):
  Show a complete arithmetic problem. Do not telegraph the operation.
  Wrong choices: common procedural errors (regrouping mistake, sign error, skipped step)

TYPE B — Word Problem (realistic, one or two steps):
  Real-world scenario with specific numbers. Ask for exactly one quantity.
  Wrong choices: partial answer (only one step done), reversed operation, off-by-one or off-by-factor

TYPE C — Compare or Order Values:
  "Order these from least to greatest" or "Which is the largest?"
  Wrong choices: exploit common confusion (0.3 vs 0.30, 3/4 vs 3/8, mixed fractions)

TYPE D — Missing Value / Inverse Operation:
  "[N] × ___ = [PRODUCT]" or "What must you add to [N] to get [M]?"
  Wrong choices: wrong operation applied, adjacent factor, arithmetic slip

TYPE E — Concept Check (no calculation needed):
  Ask what a concept means or which example correctly illustrates it.
  Wrong choices: common student misconceptions — never random numbers`;
  }

  if ((theme === '68' || theme === '912') && subject === 'math') {
    return `
QUESTION TYPE TEMPLATES — assign a type to each of the 5 questions (vary types):

TYPE A — Solve Directly:
  A complete equation or expression requiring full solution. Show all needed information.
  Wrong choices: sign error, order-of-operations mistake, arithmetic slip on one step

TYPE B — Multi-Step Word Problem:
  Real scenario requiring at least two operations. State all values clearly.
  Wrong choices: answer after only one step, wrong operation at a step, unit mismatch

TYPE C — Identify the Error:
  "A student worked this: [SHOWN WORK]. What mistake did they make?"
  Wrong choices: plausible but incorrect diagnoses — be precise about the error type

TYPE D — Match the Representation:
  "Which equation represents: [VERBAL DESCRIPTION]?"
  Wrong choices: right numbers but wrong operation, right structure but misplaced variables

TYPE E — Interpret and Conclude:
  Given a described table, expression, or graph — extract a value or state its meaning.
  Wrong choices: misread the data, or drew the wrong conclusion from correct data`;
  }

  if ((theme === '35' || theme === '68' || theme === '912') && (subject === 'reading' || subject === 'writing')) {
    return `
QUESTION TYPE TEMPLATES — assign a type to each of the 5 questions (vary types):

TYPE A — Textual Evidence (Key Detail):
  Write a 4–6 sentence paragraph relevant to the CCSS standard. Ask about a specific fact or event from the text.
  Wrong choices: details that ARE in the passage but answer a different question

TYPE B — Inference and Analysis:
  Same or a new paragraph. "What can you conclude about ___?" or "What does the author suggest?"
  Wrong choices: unsupported by the text, contradicts the text, partially but not fully correct

TYPE C — Vocabulary in Context:
  A sentence or short passage with a target word. "The word '[WORD]' most nearly means ___"
  Wrong choices: other valid meanings in a different context; near-synonyms that don't fit here

TYPE D — Author's Craft or Text Structure:
  Ask WHY the author included a detail or HOW the text is organized.
  Wrong choices: describe what was said (not why), or use structure labels that don't match

TYPE E — Grammar, Mechanics, or Usage (Writing topics):
  "Which version of the sentence is correct?" Show 4 versions, each with exactly one different error.
  Errors: comma splice, subject-verb agreement, pronoun agreement, apostrophe misuse`;
  }

  if (theme === '912' && subject === 'sat') {
    return `
QUESTION TYPE TEMPLATES — mirror real SAT format exactly:

TYPE A — Inference from Passage:
  Write a 4–6 sentence excerpt in academic prose. Ask what the author implies or concludes.
  Wrong choices: too broad, too narrow, contradicts the passage, misattributes a claim

TYPE B — Words in Context:
  "As used in this passage, the word '___' most nearly means ___"
  Wrong choices: other definitions of the word that do not fit this context

TYPE C — Data Analysis:
  Describe a table or chart. Ask for a specific comparison, trend, or value.
  Wrong choices: adjacent values, reversed comparison, conflated percentages

TYPE D — Expression of Ideas / Grammar:
  Show a sentence with an underlined portion. Ask for the best revision or "NO CHANGE."
  Wrong choices: each introduces a distinct error type (wordiness, ambiguity, grammar)

TYPE E — Heart of Algebra:
  A word problem solvable with a linear equation or inequality. Include all values.
  Wrong choices: wrong direction of inequality, coefficient error, misread the constraint`;
  }

  // Default fallback
  return `
QUESTION TYPE TEMPLATES — assign a type to each of the 5 questions (vary types):
TYPE A — Direct knowledge: ask what a specific term, rule, or concept means
TYPE B — Application: apply the concept to a simple scenario with specific values
TYPE C — Identify / Classify: given examples, pick the one that fits the rule
TYPE D — Compare: which option is correct, greater, or better aligned with the concept
TYPE E — Spot the error: which choice demonstrates a common student mistake about this topic
For ALL types: wrong choices must represent real student errors — never random or obviously absurd values.`;
}

// ── EXACT REPLICATION OF fetchQuestionBatch() PROMPT LOGIC FROM dashboard.html ─
function buildQuestionPrompt(topic) {
  const { gradeLabel, subject, name, category, standard, theme } = topic;
  const isYoung = theme === 'k2';
  const is35    = theme === '35';

  const langNote = isYoung
    ? 'Language must match a Kindergarten–2nd grade level exactly: very short sentences, simple everyday words, warm and encouraging tone. No abstract or academic vocabulary.'
    : is35
    ? 'Language must match a 3rd–5th grade level: clear sentences, grade-appropriate vocabulary, no jargon.'
    : '';

  const emojiRule = isYoung
    ? 'USE emojis (🍎 🐶 ⭐ 🎈 🐸 🏠 ✏️ 🌈 🐱 🎒 🌟 🍭 🦋 🐥) to represent objects visually in questions and answer choices. No external images — emojis only.'
    : 'Do not use emojis or special unicode symbols in questions or answers.';

  const standardLine = standard ? `- CCSS Standard: ${standard}` : '';
  const templates    = getQuestionTemplates(subject, theme, name, category);

  return `You are a rigorous K-12 assessment designer. Generate high-quality multiple choice questions that test genuine understanding — not pattern recognition or test-taking shortcuts.

ASSIGNMENT:
- Grade: ${gradeLabel}
- Subject: ${subject}
- Topic: ${name}
- Category: ${category}
${standardLine}

${templates}

MANDATORY RULES — every question must satisfy ALL of these before you finalize it:
1. ANSWER NOT GUESSABLE FROM THE STEM ALONE: The correct answer requires actually knowing the concept. A student who has not studied this cannot infer it from the question wording.
2. ANSWER NOT GUESSABLE FROM THE CHOICES ALONE: A student who reads only the answer choices — ignoring the question — must NOT be able to eliminate wrong answers by obvious logic, size ordering, or pattern.
3. NO FILL-IN SEQUENCES: Never write "3, 4, 5, ___" or any pattern sequence in the stem. Ask about the concept directly.
4. AUTHENTIC WRONG ANSWERS: Every wrong choice represents a real student mistake — a specific miscount, procedural error, or common misconception for this exact topic. Not random numbers, not obviously absurd values.
5. ${langNote || 'Language must match the grade level exactly.'}
6. ${emojiRule}
7. ${standard ? `Every question must directly assess CCSS ${standard} — stay on this standard.` : `Every question must assess "${name}" under ${category}.`}
8. Explanations written at ${gradeLabel} reading level — plain, brief, encouraging.
9. Return ONLY valid JSON — no markdown fences, no backticks, no preamble, no trailing text.
${isYoung ? '\nK-2 TONE: Warm and game-like, not test-like. Short sentences only.' : ''}
${subject === 'math' ? '\nMATH: Show numbers clearly. Questions must require actual calculation or number sense — no estimation shortcuts.' : ''}
${subject === 'sat'  ? '\nSAT: Match the exact syntax, difficulty, and style of College Board SAT questions.' : ''}

Produce exactly 5 questions. Output ONLY this JSON array:
[
  {
    "standard": "${standard || category}",
    "question": "full question text",
    "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "A",
    "explanation": "why correct, written at grade level",
    "concept": "skill this tests, 1-2 sentences at grade level"
  }
]`;
}

// ── TEST TOPICS — real curriculum IDs from dashboard.html CURRICULUM object ───
// NOTE: noEmojis format check will flag K-2 math/ELA topics as failing because
// the production prompt intentionally requires emojis for those grades. This is
// a known false-negative in the format score; track correctness score separately.
// The first three entries match the topics from the June 21 manual audit so
// ?limit=3 on the HTTP endpoint reproduces exactly the calibration baseline.
const TEST_TOPICS = [
  // ── MANUAL AUDIT TOPICS (run first — used for calibration via ?limit=3) ──
  { subject:'math', grade:'K',         gradeLabel:'Kindergarten', theme:'k2',  id:'math-k-compare-groups',                  name:'Compare Groups',                      standard:'K.CC.6',  category:'Counting & Cardinality'              },
  { subject:'math', grade:'6th',       gradeLabel:'6th Grade',    theme:'68',  id:'math-6-unit-rates',                      name:'Unit Rates',                          standard:'',        category:'Ratios & Proportional Relationships' },
  { subject:'math', grade:'Algebra 1', gradeLabel:'Algebra 1',    theme:'912', id:'math-hs-factoring-quadratics',           name:'Factoring Quadratics',                standard:'',        category:'Algebra 1'                          },
  // ── REMAINING MATH ───────────────────────────────────────────────────────
  { subject:'math', grade:'1st',       gradeLabel:'1st Grade',    theme:'k2',  id:'math-1-word-problems-add-and-subtract',  name:'Word Problems: Add and Subtract',     standard:'1.OA.1',  category:'Operations & Algebraic Thinking'    },
  { subject:'math', grade:'2nd',       gradeLabel:'2nd Grade',    theme:'k2',  id:'math-2-place-value-hundreds-tens-ones',  name:'Place Value: Hundreds Tens Ones',     standard:'',        category:'Number & Operations Base Ten'        },
  { subject:'math', grade:'3rd',       gradeLabel:'3rd Grade',    theme:'35',  id:'math-3-multiply-within-100',             name:'Multiply Within 100',                 standard:'',        category:'Operations & Algebraic Thinking'    },
  { subject:'math', grade:'4th',       gradeLabel:'4th Grade',    theme:'35',  id:'math-4-equivalent-fractions',            name:'Equivalent Fractions',                standard:'',        category:'Number & Operations - Fractions'     },
  { subject:'math', grade:'5th',       gradeLabel:'5th Grade',    theme:'35',  id:'math-5-add-fractions-unlike-denominat',  name:'Add Fractions Unlike Denominators',   standard:'',        category:'Number & Operations - Fractions'     },
  { subject:'math', grade:'7th',       gradeLabel:'7th Grade',    theme:'68',  id:'math-7-solve-two-step-equations',        name:'Solve Two-Step Equations',            standard:'',        category:'Expressions & Equations'            },
  { subject:'math', grade:'8th',       gradeLabel:'8th Grade',    theme:'68',  id:'math-8-pythagorean-theorem',             name:'Pythagorean Theorem',                 standard:'',        category:'Geometry'                           },
  { subject:'math', grade:'Geometry',  gradeLabel:'Geometry',     theme:'912', id:'math-hs-trigonometry-soh-cah-toa',       name:'Trigonometry: SOH CAH TOA',           standard:'',        category:'Geometry'                           },
  { subject:'math', grade:'Algebra 2', gradeLabel:'Algebra 2',    theme:'912', id:'math-hs-exponential-and-logarithmic-fu', name:'Exponential and Logarithmic Functions',standard:'',       category:'Algebra 2'                          },
  { subject:'math', grade:'Statistics',gradeLabel:'Statistics',   theme:'912', id:'math-hs-basic-probability',              name:'Basic Probability',                   standard:'',        category:'Statistics'                         },

  // READING K-2
  { subject:'reading', grade:'K',      gradeLabel:'Kindergarten', theme:'k2',  id:'ela-k-key-details-in-stories',           name:'Key Details in Stories',              standard:'RL.K.1',  category:'Reading Literature'                 },
  { subject:'reading', grade:'2nd',    gradeLabel:'2nd Grade',    theme:'k2',  id:'ela-2-main-topic-and-details',           name:'Main Topic and Details',              standard:'',        category:'Reading Informational'              },
  // READING 3-5
  { subject:'reading', grade:'4th',    gradeLabel:'4th Grade',    theme:'35',  id:'ela-4-main-idea',                        name:'Main Idea',                           standard:'',        category:'Reading Informational'              },
  { subject:'reading', grade:'5th',    gradeLabel:'5th Grade',    theme:'35',  id:'ela-5-text-evidence-and-inference',      name:'Text Evidence and Inference',         standard:'',        category:'Reading Literature'                 },
  // READING 6-8
  { subject:'reading', grade:'6th',    gradeLabel:'6th Grade',    theme:'68',  id:'ela-6-main-idea-and-supporting-detai',   name:'Main Idea and Supporting Details',    standard:'',        category:'Reading Informational'              },
  { subject:'reading', grade:'8th',    gradeLabel:'8th Grade',    theme:'68',  id:'ela-8-argument-evaluation',              name:'Argument Evaluation',                 standard:'',        category:'Reading Informational'              },
  // READING HS
  { subject:'reading', grade:'HS English', gradeLabel:'HS English', theme:'912', id:'ela-hs-textual-evidence-and-analysis', name:'Textual Evidence and Analysis',       standard:'',        category:'Reading Literature'                 },

  // WRITING K-2
  { subject:'writing', grade:'1st',    gradeLabel:'1st Grade',    theme:'k2',  id:'ela-1-complete-sentences',               name:'Complete Sentences',                  standard:'L.1.1j',  category:'Language'                           },
  // WRITING 3-5
  { subject:'writing', grade:'3rd',    gradeLabel:'3rd Grade',    theme:'35',  id:'ela-3-opinion-writing',                  name:'Opinion Writing',                     standard:'',        category:'Writing'                            },
  { subject:'writing', grade:'5th',    gradeLabel:'5th Grade',    theme:'35',  id:'ela-5-opinion-writing',                  name:'Opinion Writing',                     standard:'',        category:'Writing'                            },
  // WRITING 6-8
  { subject:'writing', grade:'7th',    gradeLabel:'7th Grade',    theme:'68',  id:'ela-7-argument-writing',                 name:'Argument Writing',                    standard:'',        category:'Writing'                            },
  { subject:'writing', grade:'8th',    gradeLabel:'8th Grade',    theme:'68',  id:'ela-8-informative-writing',              name:'Informative Writing',                 standard:'',        category:'Writing'                            },
  // WRITING HS
  { subject:'writing', grade:'HS English', gradeLabel:'HS English', theme:'912', id:'ela-hs-parallel-structure',            name:'Parallel Structure',                  standard:'',        category:'Language'                           },

  // SAT
  { subject:'sat', grade:'SAT', gradeLabel:'SAT Prep', theme:'912', id:'ela-hs-sat-reading-evidence-based',     name:'SAT Reading: Evidence-Based',         standard:'',        category:'SAT Prep'                           },
  { subject:'sat', grade:'SAT', gradeLabel:'SAT Prep', theme:'912', id:'ela-hs-sat-writing-grammar-convention', name:'SAT Writing: Grammar Conventions',    standard:'',        category:'SAT Prep'                           },
  { subject:'sat', grade:'SAT', gradeLabel:'SAT Prep', theme:'912', id:'ela-hs-sat-reading-paired-passages',    name:'SAT Reading: Paired Passages',        standard:'',        category:'SAT Prep'                           },
  { subject:'sat', grade:'SAT', gradeLabel:'SAT Prep', theme:'912', id:'ela-hs-sat-writing-expression-of-idea', name:'SAT Writing: Expression of Ideas',   standard:'',        category:'SAT Prep'                           },
];

// ── FORMAT CHECKS (unchanged) ────────────────────────────────────────────────
const QUALITY_CHECKS = {
  validJson:          { weight: 20, label: 'Valid JSON format'           },
  allFieldsPresent:   { weight: 15, label: 'All required fields present' },
  fourChoices:        { weight: 10, label: 'Exactly 4 answer choices'    },
  correctFieldValid:  { weight: 10, label: 'Correct field is A/B/C/D'    },
  noEmojis:           { weight: 10, label: 'No emojis or symbols (n/a for K-2 — see comment)' },
  questionLength:     { weight: 10, label: 'Question length appropriate' },
  choicesDistinct:    { weight: 10, label: 'All choices are distinct'    },
  explanationQuality: { weight: 10, label: 'Explanation is substantive'  },
  conceptPresent:     { weight:  5, label: 'Concept field present'       },
};

// ── CORRECTNESS CHECKS (new — graded by claude-opus-4-8) ────────────────────
const CORRECTNESS_CHECKS = {
  standardMatch:       { weight: 25, label: 'Tests correct CCSS standard/skill — not an adjacent one'  },
  answerCorrect:       { weight: 30, label: 'Marked-correct answer is actually correct'                 },
  uniqueAnswer:        { weight: 20, label: 'No other choice is also defensibly correct'                },
  explanationAccurate: { weight: 15, label: 'Explanation contains no arithmetic or logical error'       },
  distractorsGrounded: { weight: 10, label: 'Wrong choices represent real student misconceptions'       },
};

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runQualityTest(env, null));
  },
  async fetch(request, env) {
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'GET only' }), { status: 405 });
    }
    const { pathname } = new URL(request.url);
    if (pathname === '/run-test') {
      // ?limit=N runs only the first N topics — use for HTTP calibration checks.
      // The cron trigger always runs all topics.
      const limitParam = new URL(request.url).searchParams.get('limit');
      const limit      = limitParam ? Math.max(1, parseInt(limitParam, 10)) : null;
      const results    = await runQualityTest(env, limit);
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      status:    'NextGen Quality Test Worker v2.0',
      endpoints: { manual_run: '/run-test' },
      scheduled: 'Every Sunday at 6am UTC',
      stages:    ['generation (sonnet-4-6)', 'format checks (JS)', 'correctness grading (opus-4-8)'],
    }), { headers: { 'Content-Type': 'application/json' } });
  },
};

// ── RUN QUALITY TEST ─────────────────────────────────────────────────────────
async function runQualityTest(env, limit = null) {
  const startTime = Date.now();
  const testDate  = new Date().toISOString().split('T')[0];
  const results   = [];
  const topics    = limit ? TEST_TOPICS.slice(0, limit) : TEST_TOPICS;

  let totalFormatScore       = 0;
  let totalCorrectnessScore  = 0;
  let correctnessCount       = 0;

  console.log(`[quality-test] Starting v2 test for ${topics.length} topics…`);

  for (const topic of topics) {
    console.log(`[quality-test] ${topic.gradeLabel} / ${topic.subject} / ${topic.name}`);
    const result = await testTopic(topic, env);
    results.push(result);

    totalFormatScore += result.formatScore;
    if (result.correctnessScore !== null) {
      totalCorrectnessScore += result.correctnessScore;
      correctnessCount++;
    }

    await sleep(900);
  }

  const avgFormatScore       = Math.round(totalFormatScore / results.length);
  const avgCorrectnessScore  = correctnessCount > 0
    ? Math.round(totalCorrectnessScore / correctnessCount)
    : null;

  // Pass/warn/fail counts use combined status
  const passed   = results.filter(r => r.status === 'PASS').length;
  const failed   = results.filter(r => r.status === 'FAIL').length;
  const warnings = results.filter(r => r.status === 'WARN').length;
  const duration = Math.round((Date.now() - startTime) / 1000);

  const summary = {
    date: testDate, totalTopics: results.length,
    avgFormatScore, avgCorrectnessScore,
    passed, warnings, failed, duration, results,
  };

  if (env.SHEETS_SERVICE_ACCOUNT && env.SHEETS_ID) await saveToSheets(summary, env);
  if (env.RESEND_API_KEY)                          await sendEmailReport(summary, env);

  return summary;
}

// ── TEST A SINGLE TOPIC ──────────────────────────────────────────────────────
async function testTopic(topic, env) {
  const userPrompt = buildQuestionPrompt(topic);

  let rawResponse  = '';
  let parseError   = null;
  let questions    = [];
  let generationMs = 0;

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
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });
    generationMs = Date.now() - t0;
    const data  = await res.json();
    rawResponse = data.content?.[0]?.text || '';
    questions   = JSON.parse(rawResponse.trim().replace(/```json|```/g, '').trim());
  } catch(e) {
    parseError = e.message;
  }

  // Stage 2 — format checks
  const checks     = runChecks(questions, rawResponse, parseError, topic.grade);
  const formatScore = calculateScore(checks);
  const formatIssues = getIssues(checks, questions);

  // Stage 3 — correctness grading (skip if generation failed)
  let correctness = { score: null, perQuestion: [], issues: [], graderMs: 0, error: null };
  if (questions.length > 0) {
    await sleep(600);
    correctness = await gradeCorrectness(questions, topic, env);
  }

  const status = combinedStatus(formatScore, correctness.score);

  return {
    subject:      topic.subject,
    grade:        topic.grade,
    gradeLabel:   topic.gradeLabel,
    topic:        topic.name,
    category:     topic.category,
    topicId:      topic.id,
    // Format
    formatScore,
    formatStatus: formatScore >= 80 ? 'PASS' : formatScore >= 60 ? 'WARN' : 'FAIL',
    formatChecks: checks,
    formatIssues,
    // Correctness
    correctnessScore:   correctness.score,
    correctnessStatus:  correctness.score === null ? 'N/A'
                        : correctness.score >= 80 ? 'PASS'
                        : correctness.score >= 60 ? 'WARN' : 'FAIL',
    correctnessChecks:  correctness.perQuestion,
    correctnessIssues:  correctness.issues,
    graderError:        correctness.error,
    // Combined
    status,
    // Timing
    generationMs,
    gradingMs:    correctness.graderMs,
    // Legacy / convenience
    overallScore: formatScore,
    issues:       formatIssues,
    sampleQuestion: questions[0] || null,
    parseError,
  };
}

// ── CORRECTNESS GRADER (claude-opus-4-8) ─────────────────────────────────────
async function gradeCorrectness(questions, topic, env) {
  const graderPrompt = `You are a K-12 assessment quality auditor. Independently verify the correctness of the questions below.

Be strict. Resolve any ambiguity against the question (when in doubt, mark false).

TOPIC CONTEXT:
Grade: ${topic.gradeLabel}
Subject: ${topic.subject}
Skill Being Tested: "${topic.name}" — domain: "${topic.category}"
${topic.standard ? `CCSS Standard: ${topic.standard}` : '(No specific CCSS code — assess whether each question targets the stated skill and domain, not an adjacent one)'}

QUESTIONS TO EVALUATE:
${JSON.stringify(questions, null, 2)}

For each question (q=0 through q=4), evaluate all five checks:

────────────────────────────────────────────────────────────────────────
CHECK 1 — standardMatch
Does this question DIRECTLY test "${topic.name}" (${topic.category})?
Fail if it tests a clearly adjacent but DIFFERENT skill.
Examples of failures:
• "Compare Groups" (K.CC.6) slot filled by a question that only counts a single group (that is K.CC.5).
• "Unit Rates" slot filled by a ratio-table question that never computes a per-unit value.
• "Factoring Quadratics" slot filled by a question solved via the quadratic formula instead.

────────────────────────────────────────────────────────────────────────
CHECK 2 — answerCorrect
Solve the question yourself — do not rely on the explanation.
For math: calculate the answer. For reading/ELA: reason from the passage/text given.
Mark false if the marked-correct choice is wrong. If the question lacks enough information to solve, mark false and explain.

────────────────────────────────────────────────────────────────────────
CHECK 3 — uniqueAnswer
Is any OTHER choice also defensibly correct given the question as written?
Mark false if yes. Examples:
• Two choices are algebraically equivalent (e.g., same factors in different order).
• A unit-rate question does not specify direction, making "cups per egg" and "eggs per cup" both valid.
• A reading question where two choices are equally well-supported by the passage.

────────────────────────────────────────────────────────────────────────
CHECK 4 — explanationAccurate
Check every arithmetic step and factual claim in the explanation field.
Mark false if any calculation is wrong, any expansion is incorrect, or any factual statement is false.
Vague-but-not-wrong explanations are true. Example of false: claims (2x+4)(x+2) = 2x²+8x+4 when it equals 2x²+8x+8.

────────────────────────────────────────────────────────────────────────
CHECK 5 — distractorsGrounded
For each wrong choice: is it traceable to a specific, nameable student error (off-by-one, reversed operation, sign error, wrong step, misread problem)?
Mark false if ANY wrong choice appears to be a random plausible number with no clear misconception path. If the explanation cannot account for how a student would arrive at that choice, treat it as ungrounded.
────────────────────────────────────────────────────────────────────────

Return ONLY this JSON array. Exactly 5 objects, q=0 first. Notes: empty string if passed, one specific sentence if failed.

[
  {
    "q": 0,
    "standardMatch":       true,  "standardMatchNote":       "",
    "answerCorrect":       true,  "answerCorrectNote":       "",
    "uniqueAnswer":        true,  "uniqueAnswerNote":        "",
    "explanationAccurate": true,  "explanationAccurateNote": "",
    "distractorsGrounded": true,  "distractorsGroundedNote": ""
  }
]`;

  const t0 = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-opus-4-8',
        max_tokens: 1200,
        system:     'You are a K-12 assessment auditor. Respond ONLY with valid JSON — no markdown, no backticks, no preamble.',
        messages:   [{ role: 'user', content: graderPrompt }],
      }),
    });
    const graderMs  = Date.now() - t0;
    const data      = await res.json();
    const raw       = (data.content?.[0]?.text || '').trim().replace(/```json|```/g, '').trim();
    const perQuestion = JSON.parse(raw);

    const score  = calculateCorrectnessScore(perQuestion);
    const issues = getCorrectnessIssues(perQuestion);
    return { score, perQuestion, issues, graderMs, error: null };
  } catch(e) {
    console.error('[quality-test] grader error:', e.message);
    return { score: null, perQuestion: [], issues: [`Grader call failed: ${e.message}`], graderMs: Date.now() - t0, error: e.message };
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function combinedStatus(formatScore, correctnessScore) {
  if (correctnessScore === null) {
    return formatScore >= 80 ? 'PASS' : formatScore >= 60 ? 'WARN' : 'FAIL';
  }
  const min = Math.min(formatScore, correctnessScore);
  return min >= 80 ? 'PASS' : min >= 60 ? 'WARN' : 'FAIL';
}

function calculateCorrectnessScore(perQuestion) {
  if (!Array.isArray(perQuestion) || perQuestion.length === 0) return null;
  const weights = CORRECTNESS_CHECKS;
  const questionScores = perQuestion.map(q => {
    let score = 0;
    if (q.standardMatch)       score += weights.standardMatch.weight;
    if (q.answerCorrect)       score += weights.answerCorrect.weight;
    if (q.uniqueAnswer)        score += weights.uniqueAnswer.weight;
    if (q.explanationAccurate) score += weights.explanationAccurate.weight;
    if (q.distractorsGrounded) score += weights.distractorsGrounded.weight;
    return score;
  });
  return Math.round(questionScores.reduce((a, b) => a + b, 0) / questionScores.length);
}

function getCorrectnessIssues(perQuestion) {
  const issues = [];
  for (const q of perQuestion) {
    const idx = `Q${q.q + 1}`;
    if (!q.standardMatch)       issues.push(`${idx}: wrong standard — ${q.standardMatchNote || '(no note)'}`);
    if (!q.answerCorrect)       issues.push(`${idx}: wrong answer — ${q.answerCorrectNote || '(no note)'}`);
    if (!q.uniqueAnswer)        issues.push(`${idx}: ambiguous answer — ${q.uniqueAnswerNote || '(no note)'}`);
    if (!q.explanationAccurate) issues.push(`${idx}: explanation error — ${q.explanationAccurateNote || '(no note)'}`);
    if (!q.distractorsGrounded) issues.push(`${idx}: ungrounded distractor — ${q.distractorsGroundedNote || '(no note)'}`);
  }
  return issues;
}

// ── FORMAT CHECKS (unchanged from v1) ────────────────────────────────────────
function runChecks(questions, rawResponse, parseError, grade) {
  const checks = {};
  checks.validJson = !parseError && Array.isArray(questions) && questions.length > 0;
  if (!checks.validJson) {
    Object.keys(QUALITY_CHECKS).forEach(k => { if (k !== 'validJson') checks[k] = false; });
    return checks;
  }
  checks.allFieldsPresent = questions.every(q =>
    q.question && q.choices && q.correct && q.explanation && q.concept
  );
  checks.fourChoices = questions.every(q =>
    Array.isArray(q.choices) && q.choices.length === 4
  );
  checks.correctFieldValid = questions.every(q =>
    ['A','B','C','D'].includes(q.correct)
  );
  const allText = questions.map(q =>
    (q.question || '') + (q.choices || []).join('') + (q.explanation || '')
  ).join('');
  let hasEmoji = false;
  for (let i = 0; i < allText.length; i++) {
    if (allText.codePointAt(i) > 127000) { hasEmoji = true; break; }
  }
  checks.noEmojis = !hasEmoji;
  const isYoung = ['K','1st','2nd'].includes(grade);
  const maxLen  = isYoung ? 200 : 400;
  const minLen  = isYoung ? 10  : 20;
  checks.questionLength = questions.every(q => {
    const len = (q.question || '').length;
    return len >= minLen && len <= maxLen;
  });
  checks.choicesDistinct = questions.every(q => {
    const choices = (q.choices || []).map(c => c.replace(/^[A-D]\)\s*/,'').toLowerCase().trim());
    return new Set(choices).size === choices.length;
  });
  checks.explanationQuality = questions.every(q => {
    const exp = (q.explanation || '').toLowerCase();
    return exp.length > 30 && !exp.match(/^the (correct )?answer is [a-d]\.?$/);
  });
  checks.conceptPresent = questions.every(q =>
    q.concept && q.concept.length > 15
  );
  return checks;
}

function calculateScore(checks) {
  let score = 0, total = 0;
  for (const [key, cfg] of Object.entries(QUALITY_CHECKS)) {
    total += cfg.weight;
    if (checks[key]) score += cfg.weight;
  }
  return Math.round((score / total) * 100);
}

function getIssues(checks, questions) {
  return Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => QUALITY_CHECKS[key]?.label || key);
}

// ── GOOGLE JWT AUTH (unchanged) ───────────────────────────────────────────────
async function getGoogleToken(serviceAccountJson) {
  const sa  = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const encode = obj => btoa(JSON.stringify(obj)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const signingInput = `${encode({ alg:'RS256', typ:'JWT' })}.${encode({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })}`;
  const pemKey   = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig   = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt   = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  return (await tokenRes.json()).access_token;
}

// ── SAVE TO GOOGLE SHEETS (14 columns A:N) ────────────────────────────────────
async function saveToSheets(summary, env) {
  let accessToken;
  try { accessToken = await getGoogleToken(env.SHEETS_SERVICE_ACCOUNT); }
  catch(e) { console.error('[quality-test] Sheets auth failed:', e.message); return; }

  const rows = summary.results.map(r => [
    summary.date,                                    // A
    r.gradeLabel,                                    // B
    r.subject,                                       // C
    r.topic,                                         // D
    r.formatScore,                                   // E
    r.status,                                        // F  (combined)
    r.generationMs,                                  // G
    r.formatIssues.join('; ') || 'None',             // H
    r.parseError || '',                              // I
    r.sampleQuestion?.question?.substring(0, 100) || '', // J
    r.correctnessScore ?? '',                        // K
    r.correctnessStatus || '',                       // L
    r.correctnessIssues.join(' | ').substring(0, 300) || 'None', // M
    r.graderError || '',                             // N
  ]);

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEETS_ID}/values/Sheet1!A:N:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: rows }),
      }
    );
    const data = await res.json();
    console.log('[quality-test] Sheets:', data.updates?.updatedRows, 'rows added');
  } catch(e) {
    console.error('[quality-test] Sheets write failed:', e.message);
  }
}

// ── EMAIL REPORT ──────────────────────────────────────────────────────────────
async function sendEmailReport(summary, env) {
  const { date, totalTopics, avgFormatScore, avgCorrectnessScore, passed, warnings, failed, duration, results } = summary;

  const overallAvg    = avgCorrectnessScore !== null
    ? Math.round((avgFormatScore + avgCorrectnessScore) / 2)
    : avgFormatScore;
  const statusEmoji   = overallAvg >= 80 ? '✅' : overallAvg >= 60 ? '⚠️' : '🚨';
  const statusWord    = overallAvg >= 80 ? 'HEALTHY' : overallAvg >= 60 ? 'NEEDS ATTENTION' : 'ACTION REQUIRED';

  const scoreColor = s => s === null ? '#888' : s >= 80 ? '#1A5C38' : s >= 60 ? '#8B6914' : '#C0392B';
  const scoreBg    = s => s === null ? '#f5f5f5' : s >= 80 ? '#F0FFF4' : s >= 60 ? '#FFFBEB' : '#FFF5F5';

  const rowsHtml = results.map(r => {
    const bg   = scoreBg(r.correctnessScore !== null ? Math.min(r.formatScore, r.correctnessScore) : r.formatScore);
    const stat = r.status;
    const sc   = scoreColor(stat === 'PASS' ? 90 : stat === 'WARN' ? 70 : 40);
    return `<tr style="background:${bg};">
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px;">${r.gradeLabel}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px;text-transform:capitalize;">${r.subject}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px;">${r.topic}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px;font-weight:700;color:${scoreColor(r.formatScore)};">${r.formatScore}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px;font-weight:700;color:${scoreColor(r.correctnessScore)};">${r.correctnessScore ?? '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px;font-weight:700;color:${sc};">${stat}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;color:#666;">${r.formatIssues.length ? r.formatIssues.join(', ') : '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;color:#888;">${r.generationMs}ms</td>
    </tr>`;
  }).join('');

  const failedResults = results.filter(r => r.status !== 'PASS');
  const failDetail = failedResults.length ? `
    <h3 style="color:#C0392B;margin-top:28px;">Topics Needing Attention</h3>
    ${failedResults.map(r => `
      <div style="background:#FFF5F5;border:1px solid #FED7D7;border-radius:8px;padding:16px;margin-bottom:12px;">
        <strong>${r.gradeLabel} — ${r.subject} — ${r.topic}</strong>
        <span style="margin-left:8px;font-size:12px;color:#888;">(${r.topicId})</span><br/>
        <span style="font-size:12px;color:#666;">Format: ${r.formatScore}/100 | Correctness: ${r.correctnessScore ?? 'N/A'}/100 | Status: ${r.status}</span>
        ${r.formatIssues.length ? `<br/><span style="font-size:12px;color:#C0392B;">Format: ${r.formatIssues.join(', ')}</span>` : ''}
        ${r.correctnessIssues.length ? `
          <div style="margin-top:8px;">
            ${r.correctnessIssues.map(i => `<div style="font-size:11px;color:#C0392B;margin-top:3px;">⚠ ${i}</div>`).join('')}
          </div>` : ''}
        ${r.graderError ? `<div style="font-size:11px;color:#888;margin-top:4px;">Grader error: ${r.graderError}</div>` : ''}
        ${r.sampleQuestion ? `<div style="font-size:12px;color:#444;margin-top:8px;font-style:italic;">"${r.sampleQuestion.question?.substring(0,120)}…"</div>` : ''}
      </div>`).join('')}
  ` : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'DM Sans',Arial,sans-serif;background:#F8F6F0;margin:0;padding:24px;">
<div style="max-width:900px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

  <div style="background:#112240;padding:32px;text-align:center;">
    <div style="font-size:28px;margin-bottom:8px;">${statusEmoji}</div>
    <h1 style="color:#C9A84C;font-size:22px;margin:0 0 4px;">NextGen Tutoring — Quality Report</h1>
    <p style="color:rgba(255,255,255,0.6);margin:0;font-size:14px;">${date} · v2 (format + correctness grading)</p>
  </div>

  <!-- Summary Cards -->
  <div style="display:flex;border-bottom:1px solid #eee;">
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #eee;">
      <div style="font-size:30px;font-weight:700;color:${scoreColor(avgFormatScore)};">${avgFormatScore}</div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Format Avg</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #eee;">
      <div style="font-size:30px;font-weight:700;color:${scoreColor(avgCorrectnessScore)};">${avgCorrectnessScore ?? '—'}</div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Correctness Avg</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #eee;">
      <div style="font-size:30px;font-weight:700;color:#1A5C38;">${passed}</div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Passed</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #eee;">
      <div style="font-size:30px;font-weight:700;color:#8B6914;">${warnings}</div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Warnings</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;">
      <div style="font-size:30px;font-weight:700;color:#C0392B;">${failed}</div>
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Failed</div>
    </div>
  </div>

  <div style="padding:12px 32px;background:${overallAvg >= 80 ? '#F0FFF4' : overallAvg >= 60 ? '#FFFBEB' : '#FFF5F5'};border-bottom:1px solid #eee;text-align:center;">
    <strong style="color:${scoreColor(overallAvg >= 80 ? 90 : overallAvg >= 60 ? 70 : 40)};">Platform Status: ${statusWord}</strong>
    <span style="color:#888;font-size:13px;margin-left:8px;">— ${totalTopics} topics in ${duration}s</span>
  </div>

  <!-- Results Table -->
  <div style="padding:24px 32px;">
    <h3 style="color:#112240;margin-top:0;">Full Results</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#112240;color:#C9A84C;">
          <th style="padding:9px 10px;text-align:left;">Grade</th>
          <th style="padding:9px 10px;text-align:left;">Subject</th>
          <th style="padding:9px 10px;text-align:left;">Topic</th>
          <th style="padding:9px 10px;text-align:left;">Format</th>
          <th style="padding:9px 10px;text-align:left;">Correct</th>
          <th style="padding:9px 10px;text-align:left;">Status</th>
          <th style="padding:9px 10px;text-align:left;">Format Issues</th>
          <th style="padding:9px 10px;text-align:left;">Speed</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    ${failDetail}

    <div style="margin-top:24px;padding:16px;background:#F8F6F0;border-radius:8px;font-size:12px;color:#888;">
      <strong>Score Guide:</strong> 80-100 = Pass &nbsp;|&nbsp; 60-79 = Warning &nbsp;|&nbsp; 0-59 = Fail<br/>
      <strong>Format checks (JS):</strong> valid JSON, required fields, 4 choices, correct field A/B/C/D, question length, distinct choices, substantive explanation, concept field<br/>
      <strong>Correctness checks (Opus):</strong> standard match (25pt), answer correct (30pt), unique answer (20pt), explanation accurate (15pt), distractors grounded (10pt) — per question, averaged across 5.<br/>
      <strong>Status:</strong> PASS requires both Format ≥ 80 and Correctness ≥ 80. Status uses the lower of the two.<br/>
      <em>Note: K-2 math/ELA topics will show Format "No emojis" as failing — the production prompt intentionally requires emojis for those grades.</em><br/><br/>
      View logs: <a href="https://docs.google.com/spreadsheets/d/${env.SHEETS_ID}" style="color:#112240;">Google Sheet</a>
    </div>
  </div>

</div>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'NextGen Quality Bot <reports@nextgentutoring.org>',
        to:      ['nextgentutoringco@gmail.com'],
        subject: `${statusEmoji} NextGen Quality Report — ${date} — Format: ${avgFormatScore} | Correct: ${avgCorrectnessScore ?? 'N/A'}`,
        html,
      }),
    });
    console.log('[quality-test] Email sent:', (await res.json()).id);
  } catch(e) {
    console.error('[quality-test] Email failed:', e.message);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
