# 🚀 Multi-Provider CLI Bot v2

A production-grade AI command-line chatbot built with **Node.js** supporting multiple AI providers:

* Gemini Flash
* OpenAI GPT-4o-mini
* Claude Haiku

This project demonstrates:

* Multi-provider AI integration
* Streaming responses
* Async handling
* Retry mechanisms
* Exponential backoff
* Token counting
* Production-grade error handling

---

# 📌 Features

✅ Multi-provider AI chatbot
✅ Gemini API integration
✅ OpenAI API integration
✅ Anthropic API integration
✅ Streaming responses
✅ Retry handling with exponential backoff
✅ Token counting support
✅ Production-grade error handling
✅ Secure API key management using `.env`
✅ Terminal-based CLI interface
✅ Async/Await architecture
✅ Easy provider switching using CLI arguments

---

# 🛠️ Tech Stack

* Node.js
* JavaScript
* dotenv
* OpenAI SDK
* Google GenAI SDK
* Anthropic SDK
* p-retry

---

# 📋 Prerequisites

Before running the project, ensure you have:

* Node.js v18 or later
* npm
* Gemini API Key
* OpenAI API Key
* Anthropic API Key

Check installed versions:

```bash
node --version
npm --version
```

---

# 🔑 API Keys

## Gemini API Key

Get your Gemini API key from:

https://aistudio.google.com/app/apikey

---

## OpenAI API Key

Get your OpenAI API key from:

https://platform.openai.com/api-keys

---

## Anthropic API Key

Get your Anthropic API key from:

https://console.anthropic.com/settings/keys

---

# 📂 Project Structure

```bash
multi-provider-cli/
│
├── app.js
├── package.json
├── package-lock.json
├── .env
├── .gitignore
├── screenshots/
│   ├── gemini-output.png
│   ├── openai-anthropic-output.png
│   ├── retry-handling.png
│   └── token-count.png
└── README.md
```

---

# 🚀 Installation

## 1. Clone Repository

```bash
git clone https://github.com/Hetvi2211/multi-provider-cli.git
cd multi-provider-cli
```

---

## 2. Install Dependencies

```bash
npm install
```

OR manually install packages:

```bash
npm install dotenv openai @google/genai @anthropic-ai/sdk p-retry
```

---

# ⚙️ Configure Environment Variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GEMINI_API_KEY=your_gemini_api_key
```

---

# ▶️ Run the Application

## Gemini Provider

```bash
node app.js gemini "Explain React hooks"
```

---

## OpenAI Provider

```bash
node app.js openai "Explain React hooks"
```

---

## Anthropic Provider

```bash
node app.js anthropic "Explain React hooks"
```

---

# 📸 Demo Screenshots

## Gemini Output

![Gemini Output](./screenshots/gemini-output.png)

---

## OpenAI + Anthropic Output

![OpenAI + Anthropic Output](./screenshots/openai-anthropic-output.png)

---

## Retry Handling

![Retry Handling](./screenshots/retry-handling.png)

---

## Token Counting

![Token Counting](./screenshots/token-count.png)

---

# 🧠 How It Works

1. User selects provider using CLI argument.
2. User enters a prompt.
3. Request is sent to selected AI provider.
4. Streaming response is displayed in terminal.
5. Retry logic handles temporary failures.
6. Token usage is calculated.
7. Errors are properly handled and displayed.

---

# ⚡ Streaming Responses

Implemented real-time streaming output for faster response generation.

Example:

```bash
Using Provider: gemini

Generating response...

React Hooks are special functions...
```

---

# 🔁 Retry + Exponential Backoff

Implemented retry handling using `p-retry`.

Features:

* Automatic retries
* Exponential delay
* Handles temporary API failures
* Handles rate limits

Example:

```bash
Retry failed. Remaining retries: 2
Retry failed. Remaining retries: 1
Retry failed. Remaining retries: 0
```

---

# 🧠 Token Counting

Implemented token tracking for monitoring API usage.

Example:

```bash
Prompt Tokens: 25
Response Tokens: 120
Total Tokens: 145
```

---

# 📊 Multi-Provider Prompt Comparison

The same prompts were tested across:

* Gemini Flash
* GPT-4o-mini
* Claude Haiku

---

## Sample Prompts Used

1. Explain React Hooks
2. Write Fibonacci code in Python
3. Summarize AI in simple words
4. Explain REST API
5. Generate SQL query
6. Debug JavaScript error
7. Create HTML landing page
8. Explain OOP concepts
9. Write professional email
10. Compare MongoDB vs MySQL

(Repeated across providers for comparison and evaluation)

---

# 📈 Evaluation Criteria

The models were compared based on:

* Response speed
* Cost efficiency
* Reasoning quality
* Coding quality
* Response clarity
* Long context handling

---

# 💰 Cost Comparison Table

| Model        | Speed     | Cost     | Strength                    | Weakness                  | Best Use              |
| ------------ | --------- | -------- | --------------------------- | ------------------------- | --------------------- |
| Gemini Flash | Very Fast | Very Low | Cheap and fast              | Slightly weaker reasoning | Bulk prompts          |
| GPT-4o-mini  | Medium    | Medium   | Strong coding and reasoning | Higher cost               | Coding + reasoning    |
| Claude Haiku | Fast      | Low      | Natural writing             | Less coding power         | Summaries and writing |

---

# 📉 Approximate Cost Analysis

| Model        | Estimated Cost for 50 Prompts |
| ------------ | ----------------------------- |
| Gemini Flash | Lowest                        |
| Claude Haiku | Low                           |
| GPT-4o-mini  | Highest                       |

---

# 🧠 Decision Matrix

| Use Case             | Recommended Model |
| -------------------- | ----------------- |
| Cheap bulk requests  | Gemini Flash      |
| Strong reasoning     | GPT-4o-mini       |
| Coding assistance    | GPT-4o-mini       |
| Fast responses       | Gemini Flash      |
| Professional writing | Claude Haiku      |
| Long context tasks   | Claude            |
| Budget-friendly apps | Gemini Flash      |

---

# ⚠️ Common Issues

## OpenAI Quota Error (429)

```text
You exceeded your current quota
```

### Solution

* Check OpenAI billing
* Add credits to account
* Verify API access

---

## Anthropic Credit Error

```text
Your credit balance is too low
```

### Solution

* Add credits in Anthropic dashboard
* Upgrade account plan

---

## Gemini Quota Error

```text
RESOURCE_EXHAUSTED
```

### Solution

* Wait for quota reset
* Create new API key if needed
* Check API usage limits

---

# 🔒 Environment Variables

Required:

```env
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GEMINI_API_KEY=your_gemini_api_key
```

Never commit your actual `.env` file to GitHub.

---

# 📚 Learning Outcomes

This project helped in understanding:

* Multi-provider AI architecture
* Streaming AI responses
* Retry handling
* Exponential backoff
* Token counting
* Async/Await in Node.js
* Production-grade API handling
* Environment variable management
* AI provider comparison

---

# 🔮 Future Improvements

* Conversation history
* Voice input support
* Web-based UI
* Docker deployment
* Function calling
* File upload support
* Database integration

