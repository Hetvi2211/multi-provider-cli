const fs   = require("fs");
const path = require("path");
// ─── File paths ───────────────────────────────────────────────────────────────
const LOGS_DIR = path.join(__dirname, "..", "logs");
const CSV_FILE = path.join(LOGS_DIR, "usage.csv");
// ─── CSV column header ────────────────────────────────────────────────────────
const CSV_HEADER =
  "timestamp,provider,model,input_tokens,output_tokens,total_tokens," +
  "cache_creation_tokens,cache_read_tokens,estimated_cost\n";
// ─── Pricing table (USD per 1 000 tokens) ────────────────────────────────────
//
//  Anthropic prompt caching cost breakdown:
//    • Cache WRITE  → 1.25× normal input price  (one-time cost to populate cache)
//    • Cache READ   → 0.10× normal input price  (90 % saving vs. uncached input)
//    • Normal input → 1.00× base price
//
//  After the first call the system prompt tokens are cached for 5 minutes
//  (refreshed with each use). On every subsequent call those tokens cost
//  only 10 % of their normal price — a 90 % reduction.
//
const PRICING = {
  openai: {
    model:         "gpt-4o-mini",
    input:         0.00015,   // $0.150 / 1M tokens
    output:        0.00060,   // $0.600 / 1M tokens
    cacheWrite:    0.00015,   // no official caching discount for this model
    cacheRead:     0.00015,
  },
  anthropic: {
    model:         "claude-3-haiku-20240307",
    input:         0.00025,   // $0.250 / 1M tokens  (base input price)
    output:        0.00125,   // $1.250 / 1M tokens
    cacheWrite:    0.0003125, // 1.25× input  → cache CREATION is slightly more expensive
    cacheRead:     0.000025,  // 0.10× input  → cache HIT costs only 10 % of normal
  },
  gemini: {
    model:         "gemini-2.5-flash",
    input:         0.000075,  // $0.075 / 1M tokens
    output:        0.000300,  // $0.300 / 1M tokens
    cacheWrite:    0.000075,
    cacheRead:     0.000075,
  },
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Create logs/ directory and write CSV header on the very first run.
 */
function ensureCSV() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(CSV_FILE)) {
    fs.writeFileSync(CSV_FILE, CSV_HEADER, "utf8");
  }
}
/**
 * Calculate estimated USD cost, accounting for Anthropic cache token pricing.
 *
 * @param {string} provider
 * @param {number} inputTokens          - normal (uncached) input tokens
 * @param {number} outputTokens         - completion tokens
 * @param {number} [cacheCreationTokens=0] - tokens written to cache (1.25× price)
 * @param {number} [cacheReadTokens=0]     - tokens read from cache  (0.10× price)
 * @returns {string}  formatted to 6 decimal places
 */
function estimateCost(
  provider,
  inputTokens,
  outputTokens,
  cacheCreationTokens = 0,
  cacheReadTokens = 0
) {
  const p = PRICING[provider];
  if (!p) return "0.000000";
  const cost =
    (inputTokens          / 1000) * p.input      +
    (outputTokens         / 1000) * p.output     +
    (cacheCreationTokens  / 1000) * p.cacheWrite +
    (cacheReadTokens      / 1000) * p.cacheRead;
  return cost.toFixed(6);
}
/**
 * Wrap a CSV field in double-quotes if it contains a comma or newline.
 */
function escapeCSV(value) {
  const str = String(value);
  return str.includes(",") || str.includes("\n") ? `"${str}"` : str;
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Append one row to logs/usage.csv.
 *
 * @param {object} params
 * @param {string} params.provider
 * @param {string} params.model
 * @param {number} params.inputTokens
 * @param {number} params.outputTokens
 * @param {number} [params.cacheCreationTokens=0]
 * @param {number} [params.cacheReadTokens=0]
 */
function logUsage({
  provider,
  model,
  inputTokens,
  outputTokens,
  cacheCreationTokens = 0,
  cacheReadTokens     = 0,
}) {
  try {
    ensureCSV();
    const timestamp     = new Date().toISOString();
    const totalTokens   = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
    const estimatedCost = estimateCost(
      provider, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens
    );
    const row = [
      escapeCSV(timestamp),
      escapeCSV(provider),
      escapeCSV(model),
      escapeCSV(inputTokens),
      escapeCSV(outputTokens),
      escapeCSV(totalTokens),
      escapeCSV(cacheCreationTokens),
      escapeCSV(cacheReadTokens),
      escapeCSV(estimatedCost),
    ].join(",") + "\n";
    fs.appendFileSync(CSV_FILE, row, "utf8");
    console.log("\n📊 Telemetry logged → logs/usage.csv");
    console.log(
      `   Tokens  : ${inputTokens} in / ${outputTokens} out / ${totalTokens} total`
    );
    if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
      console.log(
        `   Cache   : ${cacheCreationTokens} written / ${cacheReadTokens} read`
      );
    }
    console.log(`   Est. cost: $${estimatedCost}`);
  } catch (err) {
    // Telemetry failure must never crash the main application
    console.error(`⚠️  Failed to write telemetry: ${err.message}`);
  }
}
module.exports = { logUsage, estimateCost };
