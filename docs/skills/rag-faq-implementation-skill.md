# Skill: SigFleet RAG FAQ Assistant

## Purpose

Use this skill when changing SigFleet's Help Assistant, FAQ retrieval, Markdown knowledge base, account/analytics routing, role-filtered help answers, strict scope guards, or RAG architecture documentation.

The Help Assistant is not the booking chatbot. It routes questions to the correct information source: Markdown knowledge base for definitions, policies, features, and workflows; authenticated account APIs for "my" account/profile/booking questions; and analytics APIs for counts, revenue, statistics, and totals.

## Core Files

- `frontend/src/components/help/HelpAssistantWidget.jsx`
- `backend/app/routers/help_assistant.py`
- `backend/app/mongodb.py`
- `docs/help/*.md`
- `docs/skills/rag-faq-implementation-skill.md`
- `docs/RAG_FAQ_ARCHITECTURE.md`
- `docs/rag_faq_architecture.drawio.xml`

## Working Rules

- Treat the authenticated backend user role as authoritative.
- Do not trust `payload.role` from the frontend for access control.
- Keep public help docs available to guests, but filter role-specific chunks by role.
- Use the Knowledge Base for definitions, policies, features, and workflows.
- Use Account APIs for logged-in questions about my bookings, my profile, or my account.
- Use Analytics APIs for counts, revenue, statistics, and totals.
- Answer compound questions by splitting them into subquestions and answering each one.
- Prefer the Markdown knowledge base for how-to answers.
- Do not answer account or analytics questions from the Markdown knowledge base.
- Never invent pages, policies, counts, prices, booking ids, support ticket details, or account-specific data.
- For non-SigFleet questions, answer exactly: "I can only answer questions related to SigFleet."
- For sensitive personal-information questions such as password, OTP, or session data, answer exactly: "I do not have access to personal information or account data."
- If no KB, account API, or analytics API can provide the information, answer exactly: "I couldn't find that information."
- For unsupported or low-confidence SigFleet questions, answer exactly: "I couldn't find a reliable answer in the SigFleet knowledge base."

## RAG Data Model

Markdown files in `docs/help/` are the source of truth for FAQ content. Each file uses frontmatter:

```md
---
title: Customer Help
roles: guest, customer
---
```

Each `##` section becomes one retrievable chunk with:

- `chunk_id`
- `doc_id`
- `source_path`
- `title`
- `doc_title`
- `roles`
- `content`
- `embedding`
- `updated_at`

Chunks are stored in MongoDB collection `help_knowledge_chunks`.

## Diagram Flow

The architecture diagram in `docs/rag_faq_architecture.drawio.xml` should stay focused on the RAG FAQ assistant only. Keep each block short and readable, with the detailed explanation in `docs/RAG_FAQ_ARCHITECTURE.md`.

Ingestion flow:

1. Knowledge Base Files: all trusted `.md` FAQ files in `docs/help/*.md`.
2. Read Metadata: parse frontmatter title and roles.
3. Split Into Chunks: split Markdown into smaller sections by `##` headings.
4. Attach Chunk Data: attach text, source details, roles, and ids.
5. Create Vector Embeddings: create deterministic 384-D local hash vectors.
6. Store Vector Database: store chunks and vectors in MongoDB `help_knowledge_chunks`.
7. Searchable Knowledge Base: chunks plus embeddings ready for retrieval.

Retrieval flow:

1. User Query: frontend Help Assistant question.
2. Send To Help API: `POST /api/help/ask`.
3. Identify User Role: backend token/SQL role, or `guest`.
4. Block Unsafe Questions: refuse unsafe or non-SigFleet questions.
5. Pick Answer Source: route to account APIs, live SQL data, or RAG.
6. Embed User Query: convert the question to a vector using the same hash embedding.
7. Find Matching Chunks: role-filter MongoDB chunks and compare vectors.
8. Rank Best Matches: cosine similarity plus keyword overlap.
9. Check Confidence: apply confidence gate.
10. Generate Answer: Gemini uses the matched authorized chunks as context.
11. Safe Fallback: return top chunk or refusal when needed.
12. Show Final Answer: frontend displays answer and sources.

## Retrieval Flow

1. Frontend sends `POST /help/ask` with question and conversation history.
2. Backend reads the optional bearer token.
3. Backend resolves `effective_role` from the authenticated SQL user, or `guest` if no valid token exists.
4. Sensitive personal-data questions are refused.
5. Account questions such as "my bookings" or "my profile" are answered through authenticated account APIs.
6. Analytics questions such as booking totals, counts, revenue, and statistics are answered through role-scoped analytics APIs.
7. Non-SigFleet questions are refused before retrieval.
8. Conversation follow-ups are resolved into a standalone question when needed.
9. Compound questions are split into canonical subquestions.
10. Definition, policy, feature, and workflow questions use the Markdown knowledge base.
11. The Markdown knowledge base is synced into MongoDB.
12. The question is embedded with the deterministic local hash embedding.
13. MongoDB chunks are filtered by allowed roles.
14. Chunks are scored by cosine similarity plus lexical heading/content overlap.
15. High-confidence chunks go to the LLM if OpenRouter is configured.
16. If the LLM is unavailable, fallback returns the top retrieved Markdown chunk.
17. If confidence is low, the assistant refuses with the reliable-answer message.
18. Sources, confidence, retrieval type, effective role, and resolved question are returned to the frontend.

## Compound Question Handling

The assistant must answer all clear intents in prompts like:

- "How can I create an account and book?"
- "How do I complete KYC and pay?"
- "Where do I add a car and manage bookings?"

When adding new FAQ intents:

- Add synonyms in `SYNONYMS` when retrieval needs help.
- Add a canonical split pattern in `_split_compound_questions()`.
- Add or improve the matching `docs/help/*.md` section.
- Verify both the single-intent and compound prompt.

## Scope Guardrails

Out-of-scope examples:

- "Who is the Prime Minister of India?"
- "Write Python code."
- "Tell me a joke."
- "What is machine learning?"

These must return: "I can only answer questions related to SigFleet."

Account API examples:

- "What is my name?"
- "What is my email?"
- "Show my account details."
- "How many total bookings do I have?"

These must use the authenticated account or analytics API. If no logged-in user/tool is available, return: "I couldn't find that information."

Analytics API examples:

- "How many total bookings are there?"
- "What is total revenue?"
- "Show booking statistics."

These must use role-scoped analytics: customers see their own totals, managers see managed totals, and admins see platform totals.

Guest/customer/manager-safe examples:

- "How do I create an account?"
- "How can I book?"
- "What documents are needed?"
- "How do I become a manager?"

## Verification Checklist

- Backend compile passes.
- Guest asking "How can I create an account and book?" receives both account and booking sections.
- Customer asking the same compound question receives both sections.
- Logged-in customer asking "can you tell me how many total bookings are there?" receives their own booking total from analytics.
- Logged-in user asking "What is my name?" receives their account profile answer.
- "Who is the Prime Minister of India?" receives the SigFleet-only refusal.
- Unsupported SigFleet questions receive the reliable-answer refusal.
- Source titles match the chunks used in the answer.
- Role-specific docs do not appear for the wrong role.
- Frontend still sends conversation history and renders sources.
