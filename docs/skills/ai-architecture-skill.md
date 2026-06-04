# Skill: AI Architecture For SigFleet

## Purpose

Use this skill when deciding which AI technique belongs in a SigFleet feature.

The main rule: use AI where language, summarisation, search, or decision support helps. Keep money, booking, payment, availability, cancellation, and approval logic deterministic.

## AI Feature Map

| Feature | Best Tool | Why |
| --- | --- | --- |
| SigBot booking assistant | LLM + backend tool calls | Natural language input, real transactional actions |
| Daily brief banner | LLM summarisation + fallback templates | Warm personalised summary from structured data |
| Support FAQ assistant | RAG + embeddings | Answers should be grounded in docs/policies |
| Vehicle preference search | Embeddings + filters | Users describe needs semantically, then hard filters apply |
| Admin analytics summary | LLM over aggregates | Turns metrics into concise operational insight |
| Codebase exploration | Graph tools / MCP / repo search | Helps agents navigate modules safely |

## LLMs

LLMs are useful for:

- interpreting natural language
- writing concise summaries
- generating friendly user-facing text
- selecting which tool to call
- explaining operational metrics

LLMs should not be the final authority for:

- prices
- refunds
- payment status
- vehicle availability
- account permissions
- booking state transitions

In SigFleet, the safe pattern is:

1. LLM understands intent.
2. Backend tool fetches real data.
3. Backend service applies business rules.
4. LLM or frontend presents the result.

## Embeddings And Vectors

An embedding is a numeric representation of text. A vector database stores those numeric representations so similar meaning can be searched even when words differ.

Good SigFleet use cases:

- "What is cancellation refund if I cancel tomorrow?" maps to cancellation policy docs.
- "I need a car for family luggage" maps to SUV/MUV/large-boot suggestions.
- "Documents rejected, what now?" maps to KYC help content.
- Similar support ticket clustering for admins.

Not good use cases:

- checking if a car is available
- calculating a fare
- deciding if payment is complete
- enforcing role permissions

Those require exact database logic.

## RAG

RAG means Retrieval Augmented Generation:

1. User asks a question.
2. System retrieves relevant chunks from trusted docs using embeddings/vector search.
3. LLM answers using only the retrieved context.

Best SigFleet candidates:

- help center
- cancellation policy
- insurance policy
- damage penalty rules
- KYC requirements
- manager onboarding guide

RAG should cite or link the source page when used for policy/support answers.

## MCP

MCP means Model Context Protocol. It is a structured way to expose tools and resources to AI agents.

Useful MCP-style tools for SigFleet:

- database read-only analytics
- GitHub/repo inspection
- support ticket lookup
- vehicle inventory lookup
- documentation search
- deployment/CI status

MCP is best when an agent needs controlled access to external or local systems without hardcoding every action into a single prompt.

## Major Problem 1: AI Was Tempting To Use For Deterministic Logic

### What Happened

Some issues looked like AI/chatbot problems but were actually state and pricing consistency problems.

### Avoid The Loop

- First ask: "Is this language understanding or business logic?"
- If business logic, fix backend services and state transitions.
- Use LLM only to choose or explain actions, not to compute the truth.

## Major Problem 2: Tool Results Were Not Persistent Enough

### What Happened

The chatbot needed vehicle and summary details across turns. If hidden tool history omitted fields, the LLM could call tools with incomplete params.

### Avoid The Loop

- Preserve all required structured fields in hidden history.
- Treat each tool result like a compact API contract.
- Add new fields to both backend result and frontend hidden history if future turns need them.

## Favorite AI Tooling Choices

- **OpenRouter/Gemini Flash:** good for fast conversational interpretation and daily brief copy.
- **Backend tool calls:** best for booking, cancellation, pricing, wallet, and admin actions.
- **Embeddings:** best for fuzzy search and support knowledge retrieval.
- **Vector DB:** best for storing policy/help chunks and support semantic indexes.
- **MCP:** best for connecting agents to repo, docs, admin tools, analytics, and ticket systems.
- **Graphify/repo graph:** best for explaining codebase architecture and dependency paths.

## Guardrails

- Keep transactional logic deterministic.
- Log LLM failures but never crash user workflows.
- Always provide fallback copy for user-facing AI.
- Prefer local model/schema truth over pasted skeleton code.
- Verify with compile/build after AI feature changes.
