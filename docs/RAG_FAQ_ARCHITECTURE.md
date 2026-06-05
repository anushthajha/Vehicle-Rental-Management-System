# SigFleet RAG FAQ Architecture


The system is a hybrid RAG FAQ assistant. All knowledge-base `.md` files are converted into smaller chunks, those chunks are converted into vector embeddings, and the chunks plus vectors are stored in MongoDB. When the user asks a question, the question is also converted into a vector, matched with the closest stored chunks, and those matched chunks are used to generate the final answer.

It is hybrid because account-specific and live count questions are routed to backend APIs instead of asking the model to guess.

## What This Diagram Shows

The diagram has two main flows:

- Ingestion Flow: prepares trusted help content for retrieval.
- Retrieval Flow: handles a user question and returns a grounded answer.

Together, these form the SigFleet RAG architecture: prepare knowledge first, retrieve matching knowledge later, then answer using only that retrieved context.

## Ingestion Flow

The ingestion flow builds the searchable knowledge base.

### Knowledge Base Files

Source files live in:

```text
docs/help/*.md
```

These `.md` files are the knowledge base. They contain trusted SigFleet FAQ content for account creation, KYC, booking guidance, payments, manager workflows, admin workflows, navigation, and troubleshooting.

### Read Metadata

Each help file can define frontmatter:

```md
---
title: Customer Help
roles: guest, customer
---
```

The backend reads the title and role metadata from the file frontmatter. Public content is available to `guest`; role-specific content is kept role-aware for later filtering.

### Split Into Chunks

The backend splits each Markdown file into smaller sections using `##` headings. Each section becomes one retrievable chunk.

This makes retrieval more accurate because the assistant can retrieve a specific section like “Complete KYC” instead of a full long document.

### Attach Chunk Data

Each chunk stores:

- chunk id
- document id
- source path
- section title
- document title
- allowed roles
- text content
- embedding
- update time

This gives each chunk enough source detail to show citations and enough access detail to enforce role filtering.

### Create Vector Embeddings

SigFleet uses a local deterministic embedding function in `backend/app/routers/help_assistant.py`.

It converts every chunk into a 384-dimensional vector embedding using local token hashing and synonym expansion. This avoids external embedding API cost and keeps ingestion simple.

### Store Vector Database

Chunks are upserted into MongoDB collection:

```text
help_knowledge_chunks
```

In this project, MongoDB acts as the vector database. It stores the chunk text, source metadata, allowed roles, and vector embeddings. Old chunks that no longer exist in `docs/help/*.md` are removed during sync.

### Searchable Knowledge Base

After sync, MongoDB contains searchable chunks with embeddings and role metadata. This is the searchable knowledge base used during retrieval.

## Retrieval Flow

The retrieval flow starts when a user asks the Help Assistant a question.

### User Query

The frontend widget is:

```text
frontend/src/components/help/HelpAssistantWidget.jsx
```

It sends the user query and recent conversation history to the backend Help API.

### Send To Help API

The backend endpoint is:

```http
POST /api/help/ask
```

Implemented in:

```text
backend/app/routers/help_assistant.py
```

### Identify User Role

The backend resolves the real role from the authenticated token and SQL user record.

Important rule from `rag-faq-implementation-skill.md`:

```text
Treat the authenticated backend user role as authoritative.
```

The frontend role is not trusted for access control. If there is no valid token, the backend treats the user as `guest`.

### Block Unsafe Questions

Before retrieval, the backend rejects unsafe or unsupported questions.

Examples:

- Non-SigFleet question: `I can only answer questions related to SigFleet.`
- Password, OTP, or session question: `I do not have access to personal information or account data.`
- Low-confidence FAQ question: `I couldn't find a reliable answer in the SigFleet knowledge base.`

This protects the assistant from becoming a general-purpose chatbot or leaking private information.

### Pick Answer Source

Not every question should go to RAG.

The backend first chooses the safest source:

- Account Data for personal account questions.
- Live Counts for totals, revenue, statistics, and inventory counts.
- RAG retrieval for definitions, policies, workflows, and app help.

This is why the diagram says `API Or RAG`.

### Use Account APIs

Used for questions like:

- What is my name?
- What is my email?
- Show my profile.
- How many bookings do I have?
- What is my next trip?

These are answered from authenticated backend data, not from Markdown.

### Use Live SQL Data

Used for questions like:

- How many bookings are there?
- What is total revenue?
- How many managers are there?
- How many vehicles are available in Bengaluru?

These are role-scoped:

- customers see their own totals
- managers see managed totals
- admins see platform totals

### Embed User Query

For normal FAQ questions, the backend converts the user query into a vector embedding using the same local hash embedding function used during ingestion.

Using the same embedding method for chunks and questions makes similarity comparison possible.

### Find Matching Chunks

MongoDB candidate chunks are filtered by role before scoring:

- guest sees `guest`
- customer sees `customer` and `guest`
- vehicle manager sees `vehicle_manager` and `guest`
- admin sees `admin` and `guest`

This means unauthorized chunks are never sent to the model.

After role filtering, the query vector is compared with the stored chunk vectors. The chunks whose vectors are most similar to the query vector become the best matches.

### Rank Best Matches

Chunks are ranked using two signals:

- cosine similarity between the user query vector and each chunk vector
- keyword overlap between the user query and each chunk title/content

Cosine similarity finds semantically close chunks. Keyword overlap helps exact terms like KYC, payout, booking, manager, refund, or support rank correctly.

### Check Confidence

The top result must pass the confidence threshold:

```python
MIN_CONFIDENCE = 0.45
```

If confidence is low, the assistant refuses instead of guessing.

### Generate Answer

If confidence is high and `OPENROUTER_API_KEY` exists, the backend calls OpenRouter with:

```text
google/gemini-2.0-flash-exp:free
```

Gemini receives only the matched, authorized chunks as context. The prompt tells it to answer only from that context and refuse unsupported answers.

### Safe Fallback

If the model is unavailable but retrieval confidence is high, the backend returns the top retrieved Markdown chunk directly.

If confidence is low, it returns the reliable-answer refusal.

### Show Final Answer

The frontend displays:

- answer text
- source titles
- low-confidence label when applicable

The backend response includes answer, sources, role, retrieval type, confidence, and resolved question.

## How This Matches The Skill File

`docs/skills/rag-faq-implementation-skill.md` is the working checklist for developers. The most important rules are:

- Do not trust frontend role for access control.
- Use Markdown RAG for definitions, policies, features, and workflows.
- Use Account APIs for logged-in profile/account/booking questions.
- Use Analytics APIs for counts, revenue, statistics, and totals.
- Do not answer account or analytics questions from Markdown.
- Do not invent pages, policies, counts, prices, booking ids, or account-specific data.
- Refuse non-SigFleet questions.
- Refuse low-confidence SigFleet questions.

The diagram is the visual version of those rules.

## Why This Is RAG Architecture

This is a valid RAG architecture because it has the core RAG pieces:

- trusted source documents
- chunking
- embeddings
- vector-like storage
- query embedding
- retrieval
- ranking
- context-grounded generation
- source display
- confidence fallback

It is also a hybrid RAG system because it adds account and live analytics routing before document retrieval.
