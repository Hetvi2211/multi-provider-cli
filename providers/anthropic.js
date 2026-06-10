/**
 * providers/anthropic.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Anthropic Claude provider with PROMPT CACHING enabled.
 *
 * HOW PROMPT CACHING WORKS
 * ─────────────────────────
 * Anthropic caches the KV (key-value) state of any content block that has:
 *   { cache_control: { type: "ephemeral" } }
 *
 * Cache lifetime  : 5 minutes, refreshed on every use
 * Minimum size    : 1 024 tokens (Haiku) / 2 048 tokens (Sonnet/Opus)
 *                   Content shorter than the minimum is silently ignored.
 * Supported models: claude-3-haiku, claude-3-5-sonnet, claude-3-opus,
 *                   claude-3-5-haiku (all dated variants)
 *
 * COST IMPACT
 * ───────────
 *  Cache WRITE  →  1.25× normal input price  (charged once to populate)
 *  Cache READ   →  0.10× normal input price  (90 % saving on every hit)
 *  Normal input →  1.00× base price
 *
 * SYSTEM PROMPT STRATEGY
 * ───────────────────────
 * We cache a large, detailed system prompt (> 1 024 tokens) so that every
 * subsequent call to this provider pays only 10 % of the input cost for
 * those tokens. The user's actual question arrives as a separate, uncached
 * message and is charged at the normal rate.
 *
 * The system prompt below is intentionally detailed to exceed the 1 024-token
 * minimum required to activate caching on claude-3-haiku-20240307.
 */
const Anthropic    = require("@anthropic-ai/sdk");
const { recordCall, printCacheStats } = require("../utils/cacheStats");
// ─── Client ──────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
// ─── Model ───────────────────────────────────────────────────────────────────
const MODEL = "claude-3-haiku-20240307";
// ─── Cacheable system prompt ──────────────────────────────────────────────────
//
// This block is marked with cache_control so Anthropic stores its KV state
// after the first call. All subsequent calls read it from cache and are
// charged at only 10 % of the normal input token price.
//
// REQUIREMENT: must be >= 1 024 tokens for claude-3-haiku to cache it.
// The prompt below is comprehensive enough to reliably exceed that threshold.
//
const SYSTEM_PROMPT = `
You are an expert senior software engineer and technical architect with deep
expertise across the full software development lifecycle. Your role is to act
as a knowledgeable, precise, and production-focused AI assistant for software
developers.
EXPERTISE AREAS
───────────────
1. Languages & Runtimes
   - JavaScript / TypeScript (Node.js, browser, Deno, Bun)
   - Python (3.10+, async, dataclasses, typing)
   - Go, Rust, Java, Kotlin, Swift, C/C++
   - SQL (PostgreSQL, MySQL, SQLite), NoSQL (MongoDB, Redis, DynamoDB)
   - Shell scripting (Bash, PowerShell, Zsh)
2. Web Development
   - Frontend: React, Next.js, Vue 3, Svelte, Astro, Web Components
   - Backend: Express, Fastify, NestJS, Django, FastAPI, Spring Boot
   - APIs: REST, GraphQL, gRPC, WebSockets, SSE
   - CSS: Tailwind, CSS Modules, Styled Components, vanilla CSS
3. Infrastructure & DevOps
   - Containerisation: Docker, Docker Compose, Kubernetes (K8s)
   - CI/CD: GitHub Actions, GitLab CI, CircleCI, Jenkins
   - Cloud: AWS (EC2, Lambda, S3, RDS, ECS), GCP, Azure
   - IaC: Terraform, Pulumi, AWS CDK, CloudFormation
   - Monitoring: Prometheus, Grafana, Datadog, OpenTelemetry
4. Architecture & System Design
   - Microservices, event-driven architecture, CQRS, event sourcing
   - Domain-driven design (DDD), hexagonal architecture
   - CAP theorem, distributed systems, consistency models
   - API gateway patterns, BFF (Backend for Frontend)
   - Database sharding, replication, connection pooling
5. AI & Machine Learning
   - LLM integration: OpenAI, Anthropic, Google Gemini, Mistral, LLaMA
   - Prompt engineering, RAG (retrieval-augmented generation), fine-tuning
   - Vector databases: Pinecone, Weaviate, pgvector, Chroma
   - ML frameworks: PyTorch, TensorFlow, scikit-learn, HuggingFace
   - AI safety, responsible AI, bias mitigation
6. Security
   - OWASP Top 10, secure coding practices, input validation
   - Authentication: OAuth 2.0, OpenID Connect, JWT, session management
   - Encryption at rest and in transit (TLS, AES, RSA)
   - Secrets management: HashiCorp Vault, AWS Secrets Manager
   - Penetration testing basics, threat modelling
7. Testing & Quality
   - Unit testing: Jest, Vitest, Mocha, pytest, JUnit
   - Integration & E2E: Playwright, Cypress, Selenium
   - TDD, BDD (Cucumber, Gherkin)
   - Code coverage, mutation testing, static analysis (ESLint, Pylint, SonarQube)
   - Performance testing: k6, Locust, Artillery
RESPONSE GUIDELINES
───────────────────
• Always provide production-ready, idiomatic code — never toy examples.
• Include inline comments that explain WHY, not just WHAT.
• Call out security implications wherever relevant.
• Highlight performance trade-offs and alternative approaches.
• Use concrete examples and real-world analogies.
• Structure responses with clear headings when covering multiple topics.
• If a question is ambiguous, state your assumptions before answering.
• Prefer correctness and clarity over brevity.
• When providing code, always specify the language in the fenced block.
• Acknowledge uncertainty honestly rather than fabricating answers.
OUTPUT FORMAT
─────────────
• Use Markdown formatting for all responses.
• Code blocks must include the language identifier.
• Use numbered lists for sequential steps, bullet points for non-ordered items.
• Summarise the key takeaway at the end of long responses.
• For architectural questions, describe the data flow and component interactions.
COST AWARENESS (CONTEXT FOR CACHING)
──────────────────────────────────────
This system prompt is intentionally detailed to exceed Anthropic's 1 024-token
minimum for prompt caching on claude-3-haiku. Once cached, every subsequent
call reads this block from Anthropic's KV store at 10 % of the normal token
price, reducing the effective cost of the system prompt by 90 % on cache hits.
`.trim();
// ─── Main provider function ───────────────────────────────────────────────────
/**
 * Send a prompt to Claude with prompt caching enabled on the system block.
 *
 * @param {string} prompt  - The user's question or instruction.
 * @returns {Promise<{
 *   text:                string,
 *   model:               string,
 *   inputTokens:         number,
 *   outputTokens:        number,
 *   cacheCreationTokens: number,
 *   cacheReadTokens:     number,
 * }>}
 */
async function askAnthropic(prompt) {
  // ── Build request ──────────────────────────────────────────────────────────
  //
  // The `system` field is an ARRAY of content blocks (not a plain string)
  // when you want to apply cache_control to individual blocks.
  //
  // Anthropic evaluates cache_control at the BLOCK level:
  //   • The block below will be cached after the first API call.
  //   • On hit, the API returns cache_read_input_tokens > 0 in `usage`.
  //   • On miss / first call, it returns cache_creation_input_tokens > 0.
  //
  const stream = anthropic.messages.stream({
    model:      MODEL,
    max_tokens: 1024,
    // ── Cached system block ────────────────────────────────────────────────
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        // This is the caching directive.
        // "ephemeral" = cache for 5 minutes, refresh on every use.
        // Anthropic will ignore this silently if the block is < 1 024 tokens.
        cache_control: { type: "ephemeral" },
      },
    ],
    // ── User message (NOT cached — changes every call) ─────────────────────
    messages: [
      { role: "user", content: prompt },
    ],
    // betas flag enables the prompt-caching feature on supported models
    betas: ["prompt-caching-2024-07-31"],
  });
  // ── Stream response text to stdout ────────────────────────────────────────
  let finalText = "";
  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta") {
      const text = chunk.delta.text || "";
      process.stdout.write(text);
      finalText += text;
    }
  }
  // ── Retrieve final usage (including cache fields) ─────────────────────────
  //
  // getFinalMessage() resolves after the stream ends and gives us the
  // complete Message object. The `usage` field contains:
  //   input_tokens                 → normal uncached input (full price)
  //   output_tokens                → completion tokens
  //   cache_creation_input_tokens  → tokens written to cache  (1.25× price)
  //   cache_read_input_tokens      → tokens read from cache   (0.10× price)
  //
  const finalMessage = await stream.getFinalMessage();
  const usage        = finalMessage.usage || {};
  // ── Update session cache statistics ──────────────────────────────────────
  recordCall(usage);
  printCacheStats(usage);
  return {
    text:                finalText,
    model:               MODEL,
    inputTokens:         usage.input_tokens                    || 0,
    outputTokens:        usage.output_tokens                   || 0,
    cacheCreationTokens: usage.cache_creation_input_tokens     || 0,
    cacheReadTokens:     usage.cache_read_input_tokens         || 0,
  };
}
module.exports = askAnthropic;