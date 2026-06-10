const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function askOpenAI(prompt) {
  const stream = await client.chat.completions.create({
    model:    "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    stream:   true,
    // Request usage data in the final stream chunk
    stream_options: { include_usage: true },
  });

  let finalText = "";
  let usage     = { prompt_tokens: 0, completion_tokens: 0 };

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || "";
    if (text) {
      process.stdout.write(text);
      finalText += text;
    }
    // The very last chunk (choices array is empty) carries the usage object
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  return {
    text:                finalText,
    model:               "gpt-4o-mini",
    inputTokens:         usage.prompt_tokens     || 0,
    outputTokens:        usage.completion_tokens || 0,
    cacheCreationTokens: 0,   // OpenAI prompt caching not implemented in this version
    cacheReadTokens:     0,
  };
}

module.exports = askOpenAI;