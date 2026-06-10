const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function askGemini(prompt) {
  const response = await ai.models.generateContentStream({
    model:    "gemini-2.5-flash",
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
    // usageMetadata is present on the last chunk with final counts
    if (chunk.usageMetadata) {
      lastUsage = chunk.usageMetadata;
    }
  }

  return {
    text:                finalText,
    model:               "gemini-2.5-flash",
    inputTokens:         lastUsage?.promptTokenCount     || 0,
    outputTokens:        lastUsage?.candidatesTokenCount || 0,
    cacheCreationTokens: 0,   // Gemini caching not implemented in this version
    cacheReadTokens:     0,
  };
}

module.exports = askGemini;