require("dotenv").config();
const askGemini    = require("./providers/gemini");
const askOpenAI    = require("./providers/openai");
const askAnthropic = require("./providers/anthropic");
const withRetry    = require("./utils/retry");
const countTokens  = require("./utils/tokenCounter");
const { logUsage } = require("./utils/logger");
async function run() {
  const provider = process.argv[2];
  const prompt   = process.argv.slice(3).join(" ");
  if (!provider || !prompt) {
    console.log("\nUsage:");
    console.log('  node app.js gemini    "Your prompt here"');
    console.log('  node app.js openai    "Your prompt here"');
    console.log('  node app.js anthropic "Your prompt here"');
    console.log("\nNote: Run the anthropic command TWICE to see a cache hit.\n");
    return;
  }
  try {
    // Each provider returns: { text, model, inputTokens, outputTokens, ... }
    let result;
    console.log(`\nUsing Provider: ${provider}\n`);
    if (provider === "gemini") {
      result = await withRetry(() => askGemini(prompt));
    }
    else if (provider === "openai") {
      result = await withRetry(() => askOpenAI(prompt));
    }
    else if (provider === "anthropic") {
      // askAnthropic also calls printCacheStats() internally after the stream
      result = await withRetry(() => askAnthropic(prompt));
    }
    else {
      console.log(`\nUnknown provider "${provider}". Use: gemini | openai | anthropic`);
      return;
    }
    console.log("\n");
    // Legacy word-count estimate (kept for quick reference)
    console.log("Token Estimate (word count):", countTokens(result.text));
    // ── Telemetry ─────────────────────────────────────────────────────────────
    // Append a row to logs/usage.csv with real token counts + estimated cost.
    // For Anthropic, cache_creation_tokens and cache_read_tokens are also logged.
    logUsage({
      provider,
      model:               result.model,
      inputTokens:         result.inputTokens         || 0,
      outputTokens:        result.outputTokens        || 0,
      cacheCreationTokens: result.cacheCreationTokens || 0,
      cacheReadTokens:     result.cacheReadTokens     || 0,
    });
  } catch (error) {
    console.error("\nError:");
    console.error(error.message);
  }
}
run();