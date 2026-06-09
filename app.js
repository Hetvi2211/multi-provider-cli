require("dotenv").config();

const askGemini = require("./providers/gemini");
const askOpenAI = require("./providers/openai");
const askAnthropic = require("./providers/anthropic");

const withRetry = require("./utils/retry");
const countTokens = require("./utils/tokenCounter");

async function run() {
  const provider = process.argv[2];
  const prompt = process.argv.slice(3).join(" ");

  if (!provider || !prompt) {
    console.log("Usage:");
    console.log('node app.js gemini "Hello"');
    return;
  }

  try {
    let response = "";

    console.log(`\nUsing Provider: ${provider}\n`);

    if (provider === "gemini") {
      response = await withRetry(() => askGemini(prompt));
    }

    else if (provider === "openai") {
      response = await withRetry(() => askOpenAI(prompt));
    }

    else if (provider === "anthropic") {
      response = await withRetry(() => askAnthropic(prompt));
    }

    else {
      console.log("Invalid provider");
      return;
    }

    console.log("\n");

    console.log("Token Estimate:", countTokens(response));

  } catch (error) {
    console.error("\nError:");
    console.error(error.message);
  }
}

run();