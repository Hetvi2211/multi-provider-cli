const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function askAnthropic(prompt) {
  const stream = await anthropic.messages.stream({
    model: "claude-3-haiku-20240307",
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  let finalText = "";

  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta") {
      const text = chunk.delta.text || "";
      process.stdout.write(text);
      finalText += text;
    }
  }

  return finalText;
}

module.exports = askAnthropic;