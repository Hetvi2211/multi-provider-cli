const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function askGemini(prompt) {
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  let finalText = "";

  for await (const chunk of response) {
    const text = chunk.text || "";
    process.stdout.write(text);
    finalText += text;
  }

  return finalText;
}

module.exports = askGemini;