# Skill: Full SigFleet Application

## Purpose

Use this skill when making changes across the full SigFleet app: frontend pages, backend APIs, booking flows, manager/admin workflows, payments, notifications, AI features, and shared business logic.

The main habit: read the local code before implementing. Several pasted specs and intuitive assumptions did not match the actual project schema.

## Core Areas

- Frontend routes and pages: `frontend/src/App.jsx`, `frontend/src/pages/**`
- Shared UI and layout: `frontend/src/components/**`, `frontend/src/styles.css`
- API client/auth: `frontend/src/services/api.js`, `frontend/src/context/AuthContext.jsx`
- Backend app/router setup: `backend/app/main.py`, `backend/app/routers/**`
- Core services: `backend/app/services/pricing.py`, `availability.py`, `booking_flow.py`
- Models: `backend/app/models/**`
- Mongo models/helpers: `backend/app/mongodb.py`, `backend/app/mongo_models/**`
- AI agents: `backend/app/agents/**`

## Major Problem 1: Spec Drift Versus Real Schema

### What Happened

Some implementation instructions referenced fields or modules that did not exist in this app:

- `Vehicle.status`
- `Payment.status == "completed"`
- `app.models.wallet.Wallet`
- `get_mongo_client`

But the real app uses:

- `Vehicle.is_approved` and `Vehicle.is_available`
- `Payment.status` values like `created`, `paid`, `failed`, `refunded`
- `UserWallet` in `backend/app/models/payment.py`
- `get_mongo_db()`

### How To Avoid The Loop Again

- Always inspect models before implementing a spec.
- Prefer existing local helpers and enums over pasted assumptions.
- After backend changes, run Python compile checks on touched files.
- After frontend changes, run `npm run build`.
- If a feature crosses SQL and Mongo, inspect both schemas before wiring.

## Major Problem 2: Same Business Logic Reimplemented In Multiple Places

### What Happened

Pricing and booking details were partly calculated in shared services, chatbot router code, and frontend display logic. This caused amount mismatches, especially with chauffeur fees.

### How To Avoid The Loop Again

- Put business truth in backend services.
- Frontend should display backend-calculated values, not recalculate final totals.
- Chatbot should call deterministic tools, not invent or recompute transaction data.
- For money flows, verify the full chain:
  - preview amount
  - booking stored amount
  - payment amount
  - UI Pay Now amount

## Application Guardrails

- Booking availability must use backend availability logic.
- Payment status must come from `Payment` records.
- Refunds must use backend cancellation policy.
- Vehicle category filters must use category/type tables, not only text search.
- Notifications should use existing Mongo notification helpers.
- Auth/session behaviour should respect tab-isolated `sessionStorage` and HttpOnly refresh cookies.
- AI features must fail gracefully and never block dashboards, booking, or login.

## AI Feature Map Across SigFleet

| App Area | Best AI Tool | Use |
| --- | --- | --- |
| Chatbot booking | LLM + tool calls | Understand natural language, then execute real backend tools |
| Daily brief banner | LLM summarisation + fallback | Personalised dashboard greeting from structured data |
| Support/help | RAG + embeddings | Answer policy/FAQ questions from trusted docs |
| Vehicle discovery | Embeddings + SQL filters | Match natural preferences, then enforce hard filters |
| Admin analytics | LLM over aggregates | Turn metrics into concise action summaries |
| Codebase understanding | Graph/MCP/repo tools | Navigate dependencies and module ownership |

## LLMs

LLMs are best for language tasks:

- interpreting user intent
- summarising dashboard data
- writing warm customer-facing copy
- choosing which backend tool to call
- explaining admin analytics

LLMs should not decide:

- price
- refund
- availability
- payment status
- access control
- booking status

For SigFleet, safe LLM flow is:

1. LLM understands intent.
2. Backend fetches real data.
3. Deterministic service applies rules.
4. UI or LLM presents the result.

## Embeddings And Vector Search

Embeddings convert text into numeric vectors that capture meaning. Vector search finds semantically similar text even when wording differs.

Good use cases in SigFleet:

- support FAQ search
- cancellation/insurance/KYC policy lookup
- matching natural vehicle preferences
- grouping similar support tickets
- finding relevant internal docs for admins/managers

Bad use cases:

- calculating prices
- checking booking overlaps
- confirming payment
- approving KYC
- enforcing permissions

Those need exact database logic.

## RAG

RAG means Retrieval Augmented Generation.

Use it when the answer must be grounded in trusted text:

- policies
- insurance terms
- cancellation rules
- KYC requirements
- manager onboarding docs
- app documentation

Flow:

1. Chunk trusted docs.
2. Create embeddings.
3. Store vectors.
4. Retrieve relevant chunks for a user question.
5. LLM answers only from retrieved context.

## MCP

MCP means Model Context Protocol. It lets AI agents access tools/resources through controlled interfaces.

Useful MCP-style integrations for SigFleet:

- repo/code search
- GitHub issues/PRs
- database read-only analytics
- docs search
- support ticket lookup
- vehicle inventory lookup
- admin action tools

MCP is best when agents need safe, structured access to systems beyond the current prompt.

## Favorite AI Tools By Feature

- **OpenRouter/Gemini Flash:** fast language understanding and short summaries.
- **Backend tool calls:** safest for booking, price, cancellation, wallet, payment, and admin flows.
- **Embeddings/vector DB:** best for semantic support and policy search.
- **RAG:** best for grounded FAQ/policy answers.
- **MCP:** best for connecting agents to repo, docs, analytics, and admin tools.
- **Graphify/repo graph:** best for explaining architecture and module relationships.

## Verification Checklist

- Backend touched files compile.
- Frontend build passes.
- `git diff --check` passes.
- No generated cache/build files accidentally added.
- Existing dirty user files are not reverted.
- Auth still works for customer, manager, and admin.
- Booking preview, booking creation, and payment use matching amounts.
- Chatbot remains separate from daily brief agent.
- AI failures log errors but do not crash user workflows.
