/**
 * dashboard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads logs/usage.csv and prints a formatted token usage dashboard.
 *
 * Usage:
 *   node dashboard.js
 *
 * Handles two CSV schemas transparently:
 *   7-column (legacy):  timestamp, provider, model, input_tokens,
 *                       output_tokens, total_tokens, estimated_cost
 *   9-column (current): timestamp, provider, model, input_tokens,
 *                       output_tokens, total_tokens, cache_creation_tokens,
 *                       cache_read_tokens, estimated_cost
 *
 * The parser auto-detects the schema per-row using column count, so mixed
 * CSV files (produced during the transition between versions) are safe.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ─── File location ────────────────────────────────────────────────────────────
const CSV_FILE = path.join(__dirname, "logs", "usage.csv");

// ─── Display helpers ──────────────────────────────────────────────────────────

/** Width of the dashboard box */
const WIDTH = 49;

/** Draw a full-width horizontal rule */
function hr(char = "─") {
  return char.repeat(WIDTH);
}

/** Centre-pad a string inside the box width */
function centre(str) {
  const pad = Math.max(0, WIDTH - str.length);
  const left  = Math.floor(pad / 2);
  const right = pad - left;
  return " ".repeat(left) + str + " ".repeat(right);
}

/** Right-align a value label and its value in two columns */
function row(label, value, indent = 2) {
  const prefix = " ".repeat(indent) + label;
  const suffix = String(value);
  const gap    = Math.max(1, WIDTH - prefix.length - suffix.length);
  return prefix + " ".repeat(gap) + suffix;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

/**
 * Parse a single non-empty, non-header CSV line into a structured record.
 *
 * Handles:
 *   • 7-column legacy rows  (no cache columns)
 *   • 9-column current rows (with cache_creation_tokens, cache_read_tokens)
 *   • Quoted fields containing commas
 *
 * @param   {string}      line   - Raw CSV line
 * @returns {object|null}        - Parsed record, or null if the line is invalid
 */
function parseLine(line) {
  // ── Split respecting quoted fields ──────────────────────────────────────────
  const cols = [];
  let current = "";
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cols.push(current.trim()); // push the last field

  // ── Detect schema by column count ───────────────────────────────────────────
  //   7 columns → legacy format  (no cache fields)
  //   9 columns → current format (with cache fields)
  //   Anything else → skip (malformed row)

  if (cols.length === 7) {
    // Legacy schema: timestamp,provider,model,input,output,total,cost
    const [timestamp, provider, model, input, output, total, cost] = cols;
    return {
      timestamp,
      provider:             provider.toLowerCase(),
      model,
      inputTokens:          Number(input)  || 0,
      outputTokens:         Number(output) || 0,
      totalTokens:          Number(total)  || 0,
      cacheCreationTokens:  0,
      cacheReadTokens:      0,
      estimatedCost:        parseFloat(cost) || 0,
    };
  }

  if (cols.length === 9) {
    // Current schema: timestamp,provider,model,input,output,total,cacheCreate,cacheRead,cost
    const [timestamp, provider, model, input, output, total, cacheCreate, cacheRead, cost] = cols;
    return {
      timestamp,
      provider:             provider.toLowerCase(),
      model,
      inputTokens:          Number(input)       || 0,
      outputTokens:         Number(output)      || 0,
      totalTokens:          Number(total)       || 0,
      cacheCreationTokens:  Number(cacheCreate) || 0,
      cacheReadTokens:      Number(cacheRead)   || 0,
      estimatedCost:        parseFloat(cost)    || 0,
    };
  }

  // Unexpected column count — skip this row silently
  return null;
}

// ─── CSV reader ───────────────────────────────────────────────────────────────

/**
 * Read and parse logs/usage.csv into an array of record objects.
 *
 * @returns {{ records: object[], skipped: number }}
 */
function readCSV() {
  // ── Guard: file must exist ─────────────────────────────────────────────────
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`\n  ⚠️  No telemetry file found at: ${CSV_FILE}`);
    console.error("  Run at least one query first:\n");
    console.error('     node app.js gemini "Hello"\n');
    process.exit(1);
  }

  const raw     = fs.readFileSync(CSV_FILE, "utf8");
  const lines   = raw.split("\n").map(l => l.trim());
  const records = [];
  let skipped   = 0;

  lines.forEach((line, index) => {
    // Skip blank lines and the header row
    if (!line || index === 0) return;

    const record = parseLine(line);
    if (record) {
      records.push(record);
    } else {
      skipped++;
    }
  });

  return { records, skipped };
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Aggregate records by provider.
 *
 * Returns a Map keyed by provider name, where each value is:
 * {
 *   requests, inputTokens, outputTokens, totalTokens,
 *   cacheCreationTokens, cacheReadTokens, estimatedCost
 * }
 *
 * @param   {object[]} records
 * @returns {Map<string, object>}
 */
function aggregate(records) {
  const stats = new Map();

  for (const r of records) {
    if (!stats.has(r.provider)) {
      stats.set(r.provider, {
        requests:            0,
        inputTokens:         0,
        outputTokens:        0,
        totalTokens:         0,
        cacheCreationTokens: 0,
        cacheReadTokens:     0,
        estimatedCost:       0,
      });
    }

    const s = stats.get(r.provider);
    s.requests++;
    s.inputTokens         += r.inputTokens;
    s.outputTokens        += r.outputTokens;
    s.totalTokens         += r.totalTokens;
    s.cacheCreationTokens += r.cacheCreationTokens;
    s.cacheReadTokens     += r.cacheReadTokens;
    s.estimatedCost       += r.estimatedCost;
  }

  return stats;
}

// ─── Dashboard renderer ───────────────────────────────────────────────────────

/**
 * Print the full dashboard to stdout.
 *
 * @param {object[]}            records    - All parsed CSV records
 * @param {Map<string, object>} byProvider - Aggregated stats per provider
 * @param {number}              skipped    - Number of rows that failed to parse
 */
function printDashboard(records, byProvider, skipped) {
  // ── Totals across all providers ─────────────────────────────────────────────
  let grandRequests  = 0;
  let grandInput     = 0;
  let grandOutput    = 0;
  let grandTotal     = 0;
  let grandCost      = 0;
  let grandCacheCreate = 0;
  let grandCacheRead   = 0;

  for (const s of byProvider.values()) {
    grandRequests    += s.requests;
    grandInput       += s.inputTokens;
    grandOutput      += s.outputTokens;
    grandTotal       += s.totalTokens;
    grandCost        += s.estimatedCost;
    grandCacheCreate += s.cacheCreationTokens;
    grandCacheRead   += s.cacheReadTokens;
  }

  // ── Known provider display order (others appended alphabetically) ───────────
  const ORDER    = ["gemini", "openai", "anthropic"];
  const seen     = new Set(byProvider.keys());
  const others   = [...seen].filter(p => !ORDER.includes(p)).sort();
  const sequence = [...ORDER, ...others];

  // ── Formatting helpers ───────────────────────────────────────────────────────
  const num  = n  => n.toLocaleString();               // thousands separator
  const cost = c  => `$${c.toFixed(6)}`;

  // Earliest and latest timestamp in the data
  const timestamps = records.map(r => r.timestamp).sort();
  const since      = timestamps[0]     ? new Date(timestamps[0]).toLocaleString()     : "—";
  const latest     = timestamps.at(-1) ? new Date(timestamps.at(-1)).toLocaleString() : "—";

  // ── Print ────────────────────────────────────────────────────────────────────
  console.log("");
  console.log("╔" + "═".repeat(WIDTH) + "╗");
  console.log("║" + centre("📊  TOKEN USAGE DASHBOARD") + "║");
  console.log("╚" + "═".repeat(WIDTH) + "╝");
  console.log("");
  console.log(row("Data range :", since));
  console.log(row("          →", latest));
  if (skipped > 0) {
    console.log(row("⚠️  Skipped rows :", skipped));
  }

  console.log("");
  console.log("┌" + hr() + "┐");
  console.log("│" + centre("OVERALL SUMMARY") + "│");
  console.log("├" + hr() + "┤");
  console.log("│" + row("Total Requests      :", num(grandRequests))       + "│");
  console.log("│" + row("Total Input Tokens  :", num(grandInput))          + "│");
  console.log("│" + row("Total Output Tokens :", num(grandOutput))         + "│");
  console.log("│" + row("Total Tokens        :", num(grandTotal))          + "│");
  console.log("│" + row("Total Estimated Cost:", cost(grandCost))          + "│");

  if (grandCacheCreate > 0 || grandCacheRead > 0) {
    console.log("├" + hr("─") + "┤");
    console.log("│" + centre("Cache (Anthropic)") + "│");
    console.log("│" + row("  Cache Written     :", num(grandCacheCreate))  + "│");
    console.log("│" + row("  Cache Read        :", num(grandCacheRead))    + "│");
  }

  console.log("└" + hr() + "┘");

  // ── Per-provider breakdown ───────────────────────────────────────────────────
  console.log("");
  console.log("┌" + hr() + "┐");
  console.log("│" + centre("BREAKDOWN BY PROVIDER") + "│");
  console.log("└" + hr() + "┘");

  for (const provider of sequence) {
    // If the provider has no data, show zeros (so all 3 always appear)
    const s = byProvider.get(provider) || {
      requests: 0, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, cacheCreationTokens: 0,
      cacheReadTokens: 0, estimatedCost: 0,
    };

    const label = provider.charAt(0).toUpperCase() + provider.slice(1);
    const hasCache = s.cacheCreationTokens > 0 || s.cacheReadTokens > 0;

    console.log("");
    console.log("  ┌" + hr("─").slice(2) + "┐");
    console.log("  │" + centre(label) + "│");
    console.log("  ├" + hr("─").slice(2) + "┤");
    console.log("  │" + row("Requests      :", num(s.requests),        4) + "│");
    console.log("  │" + row("Input Tokens  :", num(s.inputTokens),     4) + "│");
    console.log("  │" + row("Output Tokens :", num(s.outputTokens),    4) + "│");
    console.log("  │" + row("Total Tokens  :", num(s.totalTokens),     4) + "│");
    console.log("  │" + row("Est. Cost     :", cost(s.estimatedCost),  4) + "│");

    if (hasCache) {
      console.log("  ├" + hr("─").slice(2) + "┤");
      console.log("  │" + row("Cache Written :", num(s.cacheCreationTokens), 4) + "│");
      console.log("  │" + row("Cache Read    :", num(s.cacheReadTokens),     4) + "│");

      // Cost saving = tokens read from cache × (full price − cache price)
      // Haiku: full=$0.00025/K, cache=$0.000025/K → saving=$0.000225/K
      const saving = (s.cacheReadTokens / 1000) * (0.00025 - 0.000025);
      console.log("  │" + row("Cache Saving  :", `$${saving.toFixed(6)}`,    4) + "│");
    }

    console.log("  └" + hr("─").slice(2) + "┘");
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  console.log("");
  console.log("═".repeat(WIDTH + 2));
  console.log(centre(`  Total Estimated Cost: ${cost(grandCost)}  `));
  console.log("═".repeat(WIDTH + 2));
  console.log("");
}

// ─── Entry point ─────────────────────────────────────────────────────────────
function main() {
  const { records, skipped } = readCSV();

  if (records.length === 0) {
    console.log("\n  No usage records found in logs/usage.csv.");
    console.log("  Run a query first:\n");
    console.log('     node app.js gemini "Hello"\n');
    return;
  }

  const byProvider = aggregate(records);
  printDashboard(records, byProvider, skipped);
}

main();
