/**
 * explain.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Codebase Explainer — scans a project directory, assembles the source files
 * into a structured prompt, and asks Gemini to produce a clean explanation.
 *
 * Usage:
 *   node explain.js .
 *   node explain.js ./src
 *   node explain.js C:\path\to\project
 *
 * Output sections:
 *   • Purpose      — what the project does
 *   • Architecture — folder structure and how components interact
 *   • Features     — key capabilities
 *   • Main Files   — role of each important file
 *
 * Provider: Gemini 2.5 Flash (fastest, cheapest, works with your existing key).
 * Telemetry: logs to logs/usage.csv via the shared logger (same as app.js).
 */

"use strict";

require("dotenv").config();

const fs   = require("fs");
const path = require("path");

const { GoogleGenAI } = require("@google/genai");
const { logUsage }   = require("./utils/logger");

// ─── Configuration ────────────────────────────────────────────────────────────

const MODEL = "gemini-2.5-flash";

/**
 * File extensions to include in the scan.
 * Only text-based source files that carry architectural meaning.
 */
const INCLUDE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".md"]);

/**
 * Directory names to skip entirely during recursive scan.
 * Avoids scanning thousands of vendor / build / vcs files.
 */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".cache",
  "out",
  "tmp",
  "temp",
]);

/**
 * Token budget.
 * Heuristic: 1 token ≈ 4 characters (standard rough estimate).
 * File ingestion stops as soon as the running total would exceed MAX_TOKENS.
 */
const CHARS_PER_TOKEN  = 4;
const MAX_TOKENS       = 10_000;                        // hard stop
const MAX_TOTAL_CHARS  = MAX_TOKENS * CHARS_PER_TOKEN;  // 40 000 characters

/**
 * Per-file character limit — prevents any single large file from consuming
 * the entire budget. Truncated files are labelled clearly in the prompt.
 */
const MAX_CHARS_PER_FILE = 3_000;  // ≈ 750 tokens per file

/** Estimate token count from a character count (1 token ≈ 4 chars). */
function charsToTokens(chars) {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

// ─── File scanner ─────────────────────────────────────────────────────────────

/**
 * Recursively collect all files under `dirPath` whose extension is in
 * INCLUDE_EXTENSIONS, skipping any directories in IGNORE_DIRS.
 *
 * @param   {string}   dirPath   - Absolute path to start scanning from
 * @param   {string}   rootPath  - The original root (used for relative paths)
 * @param   {string[]} [results] - Accumulator (internal)
 * @returns {string[]}           - Sorted array of absolute file paths
 */
function collectFiles(dirPath, rootPath, results = []) {
  let entries;

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    // Permission error or broken symlink — skip silently
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Skip ignored directories
      if (IGNORE_DIRS.has(entry.name)) continue;
      collectFiles(fullPath, rootPath, results);

    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (INCLUDE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  // Sort alphabetically so the prompt is deterministic across runs
  return results.sort();
}

// ─── File reader ──────────────────────────────────────────────────────────────

/**
 * Read a file and return its content, truncating if it exceeds MAX_CHARS_PER_FILE.
 *
 * @param   {string} filePath
 * @returns {string}
 */
function readFileSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.length <= MAX_CHARS_PER_FILE) return raw;

    return (
      raw.slice(0, MAX_CHARS_PER_FILE) +
      `\n\n... [truncated — file is ${raw.length} chars, showing first ${MAX_CHARS_PER_FILE}]`
    );
  } catch {
    return "[could not read file]";
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Assemble a structured prompt from the collected files.
 *
 * Priority order (files listed first get priority before budget runs out):
 *   1. README.md / readme.md        — project intent
 *   2. package.json                 — dependencies and scripts
 *   3. Entry points: app.js, index  — main execution flow
 *   4. Everything else alphabetically
 *
 * @param   {string[]} files     - Absolute paths of all collected files
 * @param   {string}   rootPath  - Project root for computing relative paths
 * @returns {{ prompt: string, fileCount: number, totalChars: number, skipped: number }}
 */
function buildPrompt(files, rootPath) {
  // ── Sort files by priority ──────────────────────────────────────────────────
  const PRIORITY = [
    /readme\.md$/i,
    /package\.json$/i,
    /^app\.[jt]sx?$/i,
    /^index\.[jt]sx?$/i,
    /^main\.[jt]sx?$/i,
    /^server\.[jt]sx?$/i,
  ];

  function priorityScore(filePath) {
    const base = path.basename(filePath);
    for (let i = 0; i < PRIORITY.length; i++) {
      if (PRIORITY[i].test(base)) return i;
    }
    return PRIORITY.length; // lower priority = higher number
  }

  const sorted = [...files].sort((a, b) => {
    const pa = priorityScore(a);
    const pb = priorityScore(b);
    return pa !== pb ? pa - pb : a.localeCompare(b);
  });

  // ── Build file sections, stopping when the 10 000-token budget is hit ────────
  //
  // Budget: MAX_TOKENS (10 000) × CHARS_PER_TOKEN (4) = 40 000 characters.
  // Each file is estimated as: section.length / 4 tokens.
  // Once adding the next file would exceed the budget, we stop and set
  // limitReached = true so the header can display the warning message.
  //
  const sections    = [];
  let   totalChars  = 0;
  let   skipped     = 0;
  let   limitReached = false;  // true when the 10 000-token cap is hit

  for (const filePath of sorted) {
    const relPath = path.relative(rootPath, filePath).replace(/\\/g, "/");
    const content = readFileSafe(filePath);
    const section = `\n${"=".repeat(60)}\nFILE: ${relPath}\n${"=".repeat(60)}\n${content}`;

    // Would adding this file push us over the 10 000-token limit?
    if (totalChars + section.length > MAX_TOTAL_CHARS) {
      limitReached = true;  // flag — used by printHeader and the prompt intro
      skipped++;
      continue;             // skip this file but keep processing for counting
    }

    sections.push(section);
    totalChars += section.length;
  }

  // ── Compose the final prompt ─────────────────────────────────────────────────
  const intro = `You are a senior software architect performing a codebase review.

Analyse the following project source files and produce a clean, structured explanation.

Your explanation MUST include exactly these four sections with these headings:

## Purpose
(What does this project do? Who is it for? What problem does it solve?)

## Architecture
(How is the code organised? What are the main layers, components, or modules?
Describe data flow — how a request/input moves through the system.)

## Features
(List the key capabilities of this project as bullet points.)

## Main Files
(For each important file, give one sentence describing its role.)

Guidelines:
- Be specific and technical. Avoid vague descriptions.
- Use the actual file names, function names, and module names from the code.
- Keep the total response under 600 words.
- Do NOT include the raw source code in your response.
- Write in clear, professional English.

Project root: ${path.basename(rootPath)}
Files scanned: ${sorted.length - skipped} of ${sorted.length}
Tokens used: ~${charsToTokens(totalChars).toLocaleString()} of ${MAX_TOKENS.toLocaleString()}
${limitReached
  ? `Note: Token limit reached. Summary generated from the first ${MAX_TOKENS.toLocaleString()} tokens of content.\n`
  : ""}
──────────────────────────────────────────────────────────────
SOURCE FILES:
`;

  return {
    prompt:       intro + sections.join(""),
    fileCount:    sorted.length - skipped,
    totalChars,
    totalTokens:  charsToTokens(totalChars),  // estimated token count
    skipped,
    limitReached,                             // true when 10 000-token cap was hit
  };
}

// ─── Gemini caller ────────────────────────────────────────────────────────────

/**
 * Send the assembled prompt to Gemini 2.5 Flash and stream the response.
 *
 * @param   {string} prompt
 * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number }>}
 */
async function explainWithGemini(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContentStream({
    model:    MODEL,
    contents: prompt,
  });

  let finalText = "";
  let lastUsage = null;

  for await (const chunk of response) {
    const text = chunk.text || "";
    if (text) {
      process.stdout.write(text);
      finalText += text;
    }
    if (chunk.usageMetadata) {
      lastUsage = chunk.usageMetadata;
    }
  }

  return {
    text:         finalText,
    inputTokens:  lastUsage?.promptTokenCount     || 0,
    outputTokens: lastUsage?.candidatesTokenCount || 0,
  };
}

// ─── Output formatter ─────────────────────────────────────────────────────────

/**
 * Print a styled header banner to the terminal.
 *
 * @param {string}  targetPath   - The path the user passed in
 * @param {number}  fileCount    - Number of files included in the prompt
 * @param {number}  totalTokens  - Estimated token count of assembled content
 * @param {number}  skipped      - Files skipped because the token cap was reached
 * @param {boolean} limitReached - Whether the 10 000-token limit was hit
 */
function printHeader(targetPath, fileCount, totalTokens, skipped, limitReached) {
  const WIDTH = 55;
  const line  = "═".repeat(WIDTH);

  console.log(`\n╔${line}╗`);
  console.log(`║${"  🔍  CODEBASE EXPLAINER".padEnd(WIDTH)}║`);
  console.log(`╚${line}╝`);
  console.log(`\n  Path    : ${path.resolve(targetPath)}`);
  console.log(`  Files   : ${fileCount} scanned`);
  console.log(`  Tokens  : ~${totalTokens.toLocaleString()} / ${MAX_TOKENS.toLocaleString()} (1 token ≈ 4 chars)`);

  // Show the token-limit warning prominently when the cap was reached
  if (limitReached) {
    console.log(`\n  ⚠️  Token limit reached.`);
    console.log(`  Analyzed first ${MAX_TOKENS.toLocaleString()} tokens.`);
    console.log(`  ${skipped} file(s) not included — summary generated from collected content.`);
  }

  console.log(`\n  Provider: Gemini 2.5 Flash\n`);
  console.log("─".repeat(WIDTH + 2));
  console.log("");
}

/**
 * Print a footer with token usage after the explanation.
 *
 * @param {number} inputTokens
 * @param {number} outputTokens
 */
function printFooter(inputTokens, outputTokens) {
  const total = inputTokens + outputTokens;
  // Gemini 2.5 Flash pricing: $0.075/1M input, $0.30/1M output
  const cost  = (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.30;

  console.log("\n" + "─".repeat(57));
  console.log(`  Tokens : ${inputTokens} in / ${outputTokens} out / ${total} total`);
  console.log(`  Cost   : $${cost.toFixed(6)}`);
  console.log("─".repeat(57) + "\n");
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  // ── Validate argument ───────────────────────────────────────────────────────
  const targetArg = process.argv[2];

  if (!targetArg) {
    console.error("\n  Usage:  node explain.js <path>");
    console.error("  Example: node explain.js .\n");
    process.exit(1);
  }

  const targetPath = path.resolve(targetArg);

  if (!fs.existsSync(targetPath)) {
    console.error(`\n  ✗ Path not found: ${targetPath}\n`);
    process.exit(1);
  }

  // ── Validate API key ────────────────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY) {
    console.error("\n  ✗ GEMINI_API_KEY is not set in your .env file.\n");
    process.exit(1);
  }

  // ── Scan files ──────────────────────────────────────────────────────────────
  const stat = fs.statSync(targetPath);

  // Accept both a directory and a single file
  const files = stat.isDirectory()
    ? collectFiles(targetPath, targetPath)
    : [targetPath];

  if (files.length === 0) {
    console.error(
      `\n  ✗ No scannable files found under: ${targetPath}\n` +
      `    Looking for: ${[...INCLUDE_EXTENSIONS].join(", ")}\n`
    );
    process.exit(1);
  }

  // ── Build prompt ────────────────────────────────────────────────────────────
  const { prompt, fileCount, totalTokens, skipped, limitReached } = buildPrompt(
    files,
    stat.isDirectory() ? targetPath : path.dirname(targetPath)
  );

  printHeader(targetArg, fileCount, totalTokens, skipped, limitReached);

  // ── Call Gemini ─────────────────────────────────────────────────────────────
  let result;
  try {
    result = await explainWithGemini(prompt);
  } catch (err) {
    console.error(`\n  ✗ Gemini API error: ${err.message}\n`);
    process.exit(1);
  }

  // ── Print footer ────────────────────────────────────────────────────────────
  printFooter(result.inputTokens, result.outputTokens);

  // ── Log telemetry ───────────────────────────────────────────────────────────
  logUsage({
    provider:     "gemini",
    model:        MODEL,
    inputTokens:  result.inputTokens,
    outputTokens: result.outputTokens,
  });
}

main();
