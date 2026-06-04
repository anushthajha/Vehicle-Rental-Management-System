# Skill: SigBot Booking Assistant

## Purpose

Use this skill when changing SigFleet's chatbot booking flow, especially vehicle search, price previews, booking creation, cancellation, and Pay Now handoff.

SigBot is not a generic support bot. It is a tool-driven booking assistant that must use real backend data and must not invent vehicles, booking ids, prices, or refund amounts.

## Core Files

- `frontend/src/components/chatbot/ChatbotWidget.jsx`
- `backend/app/routers/chatbot.py`
- `backend/app/services/pricing.py`
- `backend/app/services/availability.py`
- `backend/app/routers/bookings.py`
- `backend/app/models/booking.py`
- `backend/app/models/vehicle.py`
- `backend/app/models/vehicle_category.py`

## Working Rules

- Keep chatbot UI state and backend conversation state aligned.
- Prefer backend tool results over LLM memory.
- Preserve structured tool data in hidden conversation history when the next user action depends on it.
- Use the shared pricing service as the single source of truth.
- Never manually re-add a fee that `calculate_booking_price()` already includes.
- When confirming a booking, derive `vehicle_id`, dates, chauffeur flag, insurance, and coupon from the latest booking summary.
- Treat cancellation confirmation as a separate pending state, not just any old cancellation preview in history.

## Major Problem 1: Chauffeur Price Mismatch

### What Happened

The price breakdown showed chauffeur charges, but the Pay Now card displayed an amount without the chauffeur fee or with inconsistent fee handling.

### Root Cause

Pricing was split across multiple places:

- shared pricing service
- chatbot `calculate_price`
- chatbot `create_booking`
- frontend card rendering

The chatbot path also risked losing `with_chauffeur` between summary and confirmation.

### How To Avoid The Loop Again

- Always use `backend/app/services/pricing.py` for final totals.
- In chatbot booking creation, pass through the latest `booking_summary` data.
- Do not calculate `chauffeur_fee` again in the router if the pricing service already returned it.
- Verify both visible summary and created payment amount after any pricing change.

## Major Problem 2: Old Cancellation State Hijacking New Bookings

### What Happened

After cancelling a booking, a later "yes, confirm booking" could be interpreted as confirming cancellation because an old cancellation preview was still present in chat history.

### Root Cause

The backend searched history for the latest cancellation preview but did not compare it against newer booking summaries or cancellation completion results.

### How To Avoid The Loop Again

- Treat cancellation as pending only when its preview is newer than both:
  - latest `cancellation_complete`
  - latest `booking_summary`
- Do not let a generic confirmation phrase trigger old state.
- Keep state transitions ordered by history index, not just by existence of a tool result.

## Vehicle Search Guardrails

- If user asks for `sedan`, filter by actual vehicle category/type, not just model name.
- Normalize category aliases:
  - `ev` to `electric`
  - `traveler` to `traveller`
  - plural forms like `sedans`, `suvs`, `bikes`
- Ignore generic category words like `car`, `cars`, `vehicle`, `any`.

## AI Concepts Used Here

- **LLM:** OpenRouter/Gemini interprets natural language and emits structured tool calls.
- **Tool calling:** Backend executes `search_vehicles`, `calculate_price`, `create_booking`, `cancel_booking`, etc.
- **RAG:** Not currently required for booking transactions because the source of truth is SQL/Mongo data, not documents.
- **Embeddings/vector search:** Useful later for support FAQ retrieval, policy lookup, or fuzzy vehicle preference search.
- **MCP:** Useful for exposing repo, database, analytics, or support tools to agents in a controlled way.

## Favorite AI Tooling Fit

- LLM/tool-calling: best for natural booking conversations.
- Deterministic backend tools: best for price, availability, payment, and cancellation.
- Embeddings/vector search: best for semantic support docs and policy questions.
- MCP connectors: best for safe access to external systems like GitHub, docs, or analytics.

## Verification Checklist

- Sedan search does not return bikes/travellers.
- Chauffeur summary total equals booking/payment amount.
- Confirm booking after a cancellation does not trigger cancellation.
- Cancelling after selecting a booking still requires explicit confirmation.
- Frontend build passes.
- Backend compile passes.
