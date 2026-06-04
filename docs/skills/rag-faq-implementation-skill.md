# Skill: SigFleet RAG FAQ Assistant

## Purpose

Use this skill when changing SigFleet's Help Assistant, FAQ retrieval, Markdown knowledge base, role-filtered help answers, live FAQ shortcuts, or RAG architecture documentation.

The Help Assistant is not the booking chatbot. It answers application usage questions from Markdown help docs, safe live SQL shortcuts, and role-aware retrieval. It must not expose private platform data to the wrong role.

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
- Live user counts, manager counts, customer counts, and admin counts are admin-only.
- Live vehicle inventory counts may be public when the answer does not expose private bookings or customer details.
- Answer compound questions by splitting them into subquestions and answering each one.
- Prefer the Markdown knowledge base for how-to answers.
- Prefer deterministic SQL shortcuts only for explicitly supported live questions.
- Never invent pages, policies, counts, prices, booking ids, support ticket details, or account-specific data.

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

## Retrieval Flow

1. Frontend sends `POST /help/ask` with question and conversation history.
2. Backend reads the optional bearer token.
3. Backend resolves `effective_role` from the authenticated SQL user, or `guest` if no valid token exists.
4. Conversation follow-ups are resolved into a standalone question when needed.
5. Compound questions are split into canonical subquestions.
6. Each question checks safe live shortcuts first:
   - admin-only user count
   - public vehicle inventory count by city/type
7. If no live shortcut applies, the Markdown knowledge base is synced into MongoDB.
8. The question is embedded with the deterministic local hash embedding.
9. MongoDB chunks are filtered by allowed roles.
10. Chunks are scored by cosine similarity.
11. High-confidence chunks go to the LLM if OpenRouter is configured.
12. If the LLM is unavailable, fallback returns the top retrieved Markdown chunk.
13. Sources, confidence, retrieval type, effective role, and resolved question are returned to the frontend.

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

## Role Guardrails

Admin-only examples:

- "How many users are there?"
- "How many managers are active?"
- "How many admins?"

Non-admins must receive a refusal and no SQL count query should run.

Guest/customer/manager-safe examples:

- "How do I create an account?"
- "How can I book?"
- "What documents are needed?"
- "How many cars are available in BLR?"

## Verification Checklist

- Backend compile passes.
- Guest asking "How can I create an account and book?" receives both account and booking sections.
- Customer asking the same compound question receives both sections.
- Non-admin asking "How many users are there?" receives the admin-only refusal.
- Admin asking "How many users are there?" receives live SQL totals.
- Source titles match the chunks used in the answer.
- Role-specific docs do not appear for the wrong role.
- Frontend still sends conversation history and renders sources.
