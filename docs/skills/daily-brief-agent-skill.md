# Skill: Daily Brief Agent

## Purpose

Use this skill when changing the AI-generated dashboard greeting banner.

This feature is separate from SigBot. It has no chat UI, no user prompt, and no buttons except dismiss. It is a read-only personalised smart card shown automatically on dashboards.

## Core Files

- `backend/app/agents/daily_brief_agent.py`
- `backend/app/routers/agent.py`
- `backend/app/mongodb.py`
- `frontend/src/components/agent/DailyBriefBanner.jsx`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/pages/user/DashboardPage.jsx`
- `frontend/src/pages/manager/ManagerDashboardPage.jsx`
- `frontend/src/pages/admin/AdminDashboardPage.jsx`

## Behaviour

- Dashboard calls `GET /api/agent/daily-brief`.
- Backend stores one generated brief per user per IST date.
- The same daily brief can be reused during that date.
- Frontend shows it once per login session.
- Logout clears the session marker so the next login can show the banner again.
- Dismiss or auto-dismiss calls `POST /api/agent/daily-brief/seen`.

## Design Principles

- The banner must never break dashboard loading.
- LLM failure must fall back to deterministic text.
- Mongo persistence controls daily generation.
- Frontend session storage controls repeated display during one login.
- Use IST for date boundaries.
- Keep generated text short and useful.

## Major Problem 1: Spec Changed From Once Per Day To Every Login

### What Happened

The original behaviour was "show once per user per day." The requirement later changed to "show every time we login in a day."

### Root Cause

The backend `seen` flag originally suppressed the brief after first dismissal, which made sense for once-per-day but contradicted the later per-login requirement.

### How To Avoid The Loop Again

- Separate two concepts:
  - **daily generation:** one Mongo document per user/date
  - **display frequency:** frontend session flag per login
- Do not regenerate text every login unless explicitly requested.
- Do not use backend `seen` alone to decide whether the banner can be returned.

## Major Problem 2: Skeleton Did Not Match This Codebase

### What Happened

The pasted implementation referenced fields/modules that do not exist locally:

- `app.models.wallet.Wallet`
- `Vehicle.status`
- `Payment.status == "completed"`
- `get_mongo_client`

### Root Cause

The skeleton was generic, while SigFleet uses:

- `UserWallet` in `app.models.payment`
- `Vehicle.is_approved` and `Vehicle.is_available`
- `Payment.status` values like `created`, `paid`, `failed`, `refunded`
- `get_mongo_db()`

### How To Avoid The Loop Again

- Read local models before copying suggested code.
- Prefer existing helpers over new parallel abstractions.
- Compile backend files after changes.
- Build frontend after mounting new components.

## AI Concepts Used Here

- **LLM:** OpenRouter/Gemini writes warm 1-2 sentence summaries.
- **Fallback generation:** deterministic text ensures the banner is never blank.
- **RAG:** Not needed yet, because briefs are generated from structured operational data.
- **Embeddings/vector search:** Useful later if briefs should include semantically matched tips, policy reminders, or help-center snippets.
- **MCP:** Useful for giving agents safe access to dashboards, analytics, or admin review tools.

## Favorite AI Tooling Fit

- LLM summarisation: best for warm daily copy.
- SQL aggregation: best for active trips, revenue, pending actions.
- MongoDB: best for storing daily generated brief state.
- Session storage: best for per-login display control.

## Verification Checklist

- `GET /api/agent/daily-brief` returns a summary for logged-in users.
- Same day returns existing daily brief.
- Logout and login again shows the banner again.
- Refresh within same login does not repeatedly show it.
- Dismiss marks the brief seen.
- LLM failure returns fallback copy.
- Customer, manager, and admin dashboards all mount the banner first.
