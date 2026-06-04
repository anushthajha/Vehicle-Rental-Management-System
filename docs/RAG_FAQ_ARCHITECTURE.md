# SigFleet RAG FAQ Architecture

## Goal

The SigFleet Help Assistant answers how-to questions about using the platform. It combines role-aware Markdown RAG, deterministic live shortcuts, and an optional LLM response layer.

## End-To-End Flow

1. User opens `HelpAssistantWidget.jsx`.
2. Widget sends `POST /api/help/ask` with:
   - `question`
   - `conversation_history`
   - frontend role hint for display compatibility
3. Backend reads the optional bearer token.
4. Backend resolves `effective_role` from the authenticated SQL user. If no valid token exists, role is `guest`.
5. Backend resolves follow-ups such as "check again" or "what dates?" using conversation history.
6. Backend detects compound FAQ prompts and splits them into canonical subquestions.
7. Each subquestion first checks deterministic live answer paths:
   - Admin-only live user counts from SQL `users`
   - Public live vehicle inventory counts from SQL `vehicles`
8. If no live shortcut applies, backend syncs `docs/help/*.md` into MongoDB.
9. Markdown files are chunked by `##` heading and stored in `help_knowledge_chunks`.
10. Each chunk stores role metadata and a deterministic local embedding.
11. Backend embeds the question with the same local embedding function.
12. MongoDB candidate chunks are filtered by allowed roles:
   - guest sees `guest`
   - customer sees `customer` + `guest`
   - vehicle manager sees `vehicle_manager` + `guest`
   - admin sees `admin` + `guest`
13. Backend scores chunks with cosine similarity.
14. If confidence is high and OpenRouter is configured, the LLM writes a concise answer using only retrieved context.
15. If the LLM is unavailable, deterministic fallback returns the top retrieved chunk.
16. Compound answers are merged into separate sections.
17. Backend returns answer, sources, confidence, retrieval type, effective role, resolved question, and subquestions when applicable.
18. Frontend renders the answer and source titles.

## Main Components

- Frontend widget: chat UI, quick prompts, message history, source display.
- Help router: request validation, optional auth, role enforcement, live shortcuts, RAG retrieval, LLM call.
- SQL database: source of truth for users and vehicles.
- Markdown help docs: source of truth for FAQ content.
- MongoDB: stores retrievable chunks and embeddings.
- OpenRouter/Gemini: optional answer synthesis layer.

## Security Boundaries

- Frontend role is never trusted for access control.
- Live user counts are admin-only.
- Role-specific chunks are filtered before scoring.
- LLM receives only already-authorized chunks.
- Account-specific support, bookings, payments, and private data are not answered by RAG.

## Draw.io File

Open `docs/rag_faq_architecture.drawio.xml` in draw.io/diagrams.net to view the architecture diagram.
