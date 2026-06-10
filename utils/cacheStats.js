/**
 * cacheStats.js
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory tracker for Anthropic prompt-caching statistics.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Anthropic's prompt caching works by marking a content block with
 *   { cache_control: { type: "ephemeral" } }
 *
 * The API then returns three token fields in the `usage` object:
 *   • input_tokens            – tokens NOT read from cache (charged at full price)
 *   • cache_creation_input_tokens – tokens written INTO the cache (1.25× price, one-time)
 *   • cache_read_input_tokens     – tokens READ FROM the cache   (0.10× price, 90 % saving)
 *
 * This module accumulates those counts across multiple calls in a single
 * session so you can see the running cost savings at a glance.
 *
 * COST SAVINGS EXPLAINED
 * ──────────────────────
 *  claude-3-haiku input price: $0.25 / 1M tokens
 *
 *  Without caching (every call pays full price):
 *    1 000 system-prompt tokens × 10 calls = 10 000 tokens × $0.00025/K = $0.0025
 *
 *  With caching (cache hit after first call):
 *    Call 1  → cache WRITE: 1 000 tokens × $0.0003125/K = $0.0003125  (1.25× — one-time)
 *    Calls 2-10 → cache READ : 1 000 tokens × $0.000025/K  = $0.000025 each
 *    Total = $0.0003125 + (9 × $0.000025) = $0.000538  vs. $0.0025  →  78 % saving
 */
// ─── Running session totals ────────────────────────────────────────────────────
let sessionStats = {
  totalCalls:            0,
  cacheCreationTokens:   0,   // tokens that populated the cache (call 1)
  cacheReadTokens:       0,   // tokens served from cache (calls 2+)
  normalInputTokens:     0,   // uncached input tokens
  totalOutputTokens:     0,
};
/**
 * Record token usage from one Anthropic API response.
 *
 * @param {object} usage  — the `usage` object from the Anthropic API response
 *   @param {number} usage.input_tokens
 *   @param {number} usage.output_tokens
 *   @param {number} [usage.cache_creation_input_tokens=0]
 *   @param {number} [usage.cache_read_input_tokens=0]
 */
function recordCall(usage) {
  sessionStats.totalCalls++;
  sessionStats.normalInputTokens   += usage.input_tokens                    || 0;
  sessionStats.totalOutputTokens   += usage.output_tokens                   || 0;
  sessionStats.cacheCreationTokens += usage.cache_creation_input_tokens     || 0;
  sessionStats.cacheReadTokens     += usage.cache_read_input_tokens         || 0;
}
/**
 * Print a formatted cache statistics summary to the console.
 *
 * Shows:
 *   • Whether this call was a cache WRITE (first time) or cache HIT (subsequent)
 *   • Running session totals
 *   • Estimated cost savings vs. no caching
 *
 * @param {object} usage  — the `usage` object from the Anthropic API response
 */
function printCacheStats(usage) {
  const created = usage.cache_creation_input_tokens || 0;
  const read    = usage.cache_read_input_tokens     || 0;
  const input   = usage.input_tokens                || 0;
  const output  = usage.output_tokens               || 0;
  console.log("\n┌─────────────────────────────────────────┐");
  console.log("│        🧠 Anthropic Cache Statistics      │");
  console.log("└─────────────────────────────────────────┘");
  // ── This call ────────────────────────────────────────────────────────────
  if (created > 0) {
    // First time this system prompt was seen — Anthropic wrote it to cache
    console.log(`\n  📥 Cache STATUS   : CACHE WRITE (first call)`);
    console.log(`     Tokens written : ${created}`);
    console.log(`     Cost note      : Charged at 1.25× normal input price`);
    console.log(`                      (one-time cost to populate the cache)`);
  } else if (read > 0) {
    // System prompt was already cached — this call got a 90 % discount
    console.log(`\n  ⚡ Cache STATUS   : CACHE HIT  ✅`);
    console.log(`     Tokens read    : ${read}`);
    console.log(`     Cost note      : Charged at 0.10× normal price`);
    console.log(`                      → 90 % saving on cached tokens`);
  } else {
    console.log(`\n  ℹ️  Cache STATUS   : No cache tokens this call`);
  }
  // Normal (uncached) tokens for this call
  console.log(`\n  📨 Input tokens   : ${input}  (uncached, full price)`);
  console.log(`  📤 Output tokens  : ${output}`);
  // ── Session totals ───────────────────────────────────────────────────────
  console.log(`\n  ── Session totals (${sessionStats.totalCalls} call(s)) ──`);
  console.log(`     Cache written  : ${sessionStats.cacheCreationTokens} tokens`);
  console.log(`     Cache read     : ${sessionStats.cacheReadTokens} tokens`);
  console.log(`     Normal input   : ${sessionStats.normalInputTokens} tokens`);
  // ── Cost saving estimate ─────────────────────────────────────────────────
  //  Saving = what cache-read tokens WOULD have cost at full price
  //           minus what they actually cost at 0.10× price
  //
  //  Full price for claude-3-haiku input: $0.00025 per 1K tokens
  //  Cache read price                   : $0.000025 per 1K tokens
  //  Saving per cached token            : $0.000225 per 1K tokens  (90 %)
  const HAIKU_INPUT_PER_K    = 0.00025;
  const HAIKU_CACHE_READ_PER_K = 0.000025;
  const savingUSD =
    (sessionStats.cacheReadTokens / 1000) *
    (HAIKU_INPUT_PER_K - HAIKU_CACHE_READ_PER_K);
  if (sessionStats.cacheReadTokens > 0) {
    console.log(
      `\n  💰 Estimated saving: $${savingUSD.toFixed(6)}` +
      `  (${sessionStats.cacheReadTokens} tokens at 90 % discount)`
    );
  }
  console.log("─────────────────────────────────────────\n");
}
/**
 * Reset session statistics (useful for testing).
 */
function resetStats() {
  sessionStats = {
    totalCalls:          0,
    cacheCreationTokens: 0,
    cacheReadTokens:     0,
    normalInputTokens:   0,
    totalOutputTokens:   0,
  };
}
/**
 * Return a snapshot of the current session stats object (read-only copy).
 */
function getStats() {
  return { ...sessionStats };
}
module.exports = { recordCall, printCacheStats, resetStats, getStats };
