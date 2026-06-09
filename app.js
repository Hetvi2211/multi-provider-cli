require("dotenv").config();

const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");
const Anthropic = require("@anthropic-ai/sdk");

const provider = process.argv[2];

async function run() {

  const userMessage = process.argv[3] || "Hello AI";

  // GEMINI
  if (provider === "gemini") {

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userMessage,
    });

    console.log("\nGemini Response:\n");
    console.log(response.text);
  }

  // OPENAI
  else if (provider === "openai") {

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    console.log("\nOpenAI Response:\n");
    console.log(response.choices[0].message.content);
  }

  // ANTHROPIC
  else if (provider === "anthropic") {

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    console.log("\nAnthropic Response:\n");
    console.log(response.content[0].text);
  }

  else {
    console.log("Usage:");
    console.log('node app.js gemini "hello"');
    console.log('node app.js openai "hello"');
    console.log('node app.js anthropic "hello"');
  }
}

run().catch((error) => {
  console.error("\nError:");
  console.error(error.message);
});