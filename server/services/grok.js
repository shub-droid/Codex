import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

// ── Groq client ─────────────
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || '',
    timeout: 110_000,
});

const MODEL = 'llama-3.3-70b-versatile';

// ── Smart stack selection rules (shared across prompts) ──────────────────────
const STACK_RULES = `
STACK SELECTION — follow these rules strictly before planning:

"html" (single file, no npm needed):
  → Counter, calculator, clock, timer, stopwatch, color picker, quiz, simple game,
    form validation demo, CSS animation, landing page, static info page, unit converter,
    anything doable in ≤ 1 file with inline CSS + vanilla JS.
  → Output ONE descriptively-named HTML file (e.g. counter.html, portfolio.html,
    calculator.html, quiz.html). Use index.html ONLY for generic landing pages.
    No package.json. No build step.

"react" (Vite + React, no backend):
  → Multi-page SPA, dashboard with complex component tree, apps needing client-side routing
    or significant shared state. Must NOT need a real server or database.
  → Output a client/ folder with Vite + React + package.json.

"fullstack" (React frontend + Express backend):
  → User authentication, persistent data storage, real REST APIs, real-time features,
    server-side logic that cannot run in the browser.
  → Output client/ + server/ with separate package.json files.

RULE: When in doubt, always pick the simpler stack. Most UI demos are "html". Most CRUD apps without user accounts are "react". Only use "fullstack" when a real server is genuinely required.`;

// ── Prompts ──────────────────────────────────────────────────────────────────

const SMART_PLANNER_PROMPT = `You are a developer assistant embedded in the Codex IDE.
Your job is to analyse the user's request and return a concise project plan JSON.

${STACK_RULES}

CODE QUALITY RULES:
- Always generate complete, working files with no placeholders.
- Use modern JS best practices.
- For "html" stack: beautiful, premium design with CSS variables, smooth animations.
- For "react"/"fullstack": use Vite, functional components, hooks.
- CRITICAL: Codex IDE runs on port 3001 (server) and 5173 (client). Generated apps must use different ports (e.g. 3000 for Vite, 8080 for Express).

RESPONSE — return ONLY this JSON (no markdown, no extra text):
{
  "explanation": "One sentence describing what will be built",
  "stack": "html" | "react" | "fullstack",
  "files": [
    { "path": "counter.html", "description": "What this file does" }
  ],
  "runCommand": "command to open/run after files are created"
}

FILE NAMING for html stack — derive the filename from the request:
  "create a counter"     → counter.html
  "build a portfolio"    → portfolio.html
  "make a calculator"    → calculator.html
  "create a quiz app"    → quiz.html
  "build a clock"        → clock.html
  Generic/unclear        → index.html

runCommand examples:
  html      → "start \"\" counter.html"   (use the actual filename, not index.html)
  react     → "npm install && npm run dev"
  fullstack → "npm install --prefix client && npm install --prefix server && npm run dev --prefix server"`;

const FILE_GENERATOR_PROMPT = `You are an expert developer assistant embedded in the Codex IDE.
Generate a SINGLE, complete, production-ready file based on the project plan below.

RULES:
1. Generate the COMPLETE file — no placeholders, no "// TODO", no truncation.
2. Follow the project plan's stack and architecture.
3. Beautiful, premium UI for HTML/CSS (CSS variables, smooth transitions, responsive).
4. CRITICAL ports: Vite on 3000, Express on 8080 (never 3001 or 5173).
5. Respond ONLY with valid JSON — no markdown fences, no extra text.

RESPONSE FORMAT:
{
  "explanation": "Brief note on what was implemented",
  "file": {
    "path": "relative/path/to/file.ext",
    "content": "complete file content here",
    "action": "create"
  }
}`;

const CHAT_PROMPT = `You are an expert developer assistant embedded in the Codex IDE called "Codex".
Help the user with code questions, debugging, and explanations.
Respond in clear, helpful markdown. Do NOT generate JSON or file structures in chat mode.`;

// ── Retry wrapper ─────────────────────────────────────────────────────────────
async function withRetry(fn, retries = 3) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const is429 = err?.status === 429 ||
                err?.message?.includes('429') ||
                err?.message?.includes('Too Many Requests') ||
                err?.message?.includes('rate_limit');
            if (is429 && attempt < retries) {
                const delay = Math.pow(2, attempt) * 2000;
                console.log(`⏳ Rate limited, retrying in ${delay / 1000}s…`);
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}

// ── parseJSON helper ──────────────────────────────────────────────────────────
function parseJSON(text) {
    let cleaned = text.trim();
    // Strip markdown code fences if present
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const first = cleaned.indexOf('{');
    const last  = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
        cleaned = cleaned.slice(first, last + 1);
    }
    return JSON.parse(cleaned);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Chat with AI — general conversation / debugging (no file generation)
 */
export async function chatWithAI(message, context = {}) {
    return withRetry(async () => {
        const completion = await groq.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: CHAT_PROMPT },
                { role: 'user',   content: message },
            ],
            temperature: 0.7,
            max_tokens: 4096,
        });
        const text = completion.choices[0]?.message?.content || '';
        return { message: text };
    });
}

/**
 * Phase 1 — Smart planner.
 * Returns a plan with stack type and file list (no content yet).
 */
export async function planAndPreview(prompt) {
    return withRetry(async () => {
        const completion = await groq.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: SMART_PLANNER_PROMPT },
                { role: 'user',   content: `User request: ${prompt}\n\nRespond ONLY with the JSON plan.` },
            ],
            temperature: 0.3,   // low temp → more deterministic stack choice
            max_tokens: 1000,
        });

        const text = completion.choices[0]?.message?.content || '';
        try {
            return parseJSON(text);
        } catch (e) {
            console.error('[grok] planAndPreview parse error:', e.message);
            // Fallback: html single file
            return {
                explanation: prompt,
                stack: 'html',
                files: [{ path: 'index.html', description: 'Main application file' }],
                runCommand: '',
            };
        }
    });
}

/**
 * Phase 2 — Generate a single file's full content.
 */
export async function generateSingleFile(fileSpec, plan, originalPrompt, projectFiles = {}) {
    return withRetry(async () => {
        const fileCtx = Object.keys(projectFiles).length > 0
            ? `\n\nExisting project files:\n${Object.entries(projectFiles)
                .map(([p, c]) => `--- ${p} ---\n${c}`).join('\n\n')}`
            : '';

        const userMsg = `${fileCtx}

Original request: ${originalPrompt}

Project plan:
${JSON.stringify(plan, null, 2)}

Generate this file now:
${JSON.stringify(fileSpec, null, 2)}

Respond ONLY with the JSON object.`;

        const completion = await groq.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: FILE_GENERATOR_PROMPT },
                { role: 'user',   content: userMsg },
            ],
            temperature: 0.5,
            max_tokens: 8192,
        });

        const text = completion.choices[0]?.message?.content || '';
        try {
            return parseJSON(text);
        } catch (e) {
            console.error(`[grok] generateSingleFile parse error for ${fileSpec.path}:`, e.message);
            return { file: null };
        }
    });
}

/**
 * Legacy: generate code (used by old /generate route, kept for compatibility)
 */
export async function generateCode(prompt, projectFiles = {}) {
    // Delegate to planAndPreview — caller handles differently
    return planAndPreview(prompt);
}

/**
 * Legacy: planProject (alias kept for agent.js compatibility)
 */
export async function planProject(prompt, projectFiles = {}) {
    return planAndPreview(prompt);
}
