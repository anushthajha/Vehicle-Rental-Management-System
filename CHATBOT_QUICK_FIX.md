# 🔧 CHATBOT FIX - COMPLETE SOLUTION

## ❌ Current Problem:
Your Gemini API key has **exhausted its free tier quota** for the current minute.

**Error:** `Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests`

## ✅ SOLUTION OPTIONS:

---

## OPTION 1: Get a New Gemini API Key (RECOMMENDED - 2 minutes)

### Step 1: Create New API Key
1. Go to: https://aistudio.google.com/apikey
2. Click **"Create API Key"** or **"Get API Key"**
3. Select **"Create API key in new project"**
4. Copy the new key

### Step 2: Update .env File
Open `backend/.env` and replace the line:
```bash
GEMINI_API_KEY=AQ.Ab8RN6Ib5BEYy-OfoHaobSCOdnkNkLRbL48nSUiMXB-ya_XAVg
```

With your new key:
```bash
GEMINI_API_KEY=YOUR_NEW_KEY_HERE
```

### Step 3: Restart Backend
```bash
# Kill existing backend
lsof -ti:8000 | xargs kill -9

# Start fresh
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## OPTION 2: Wait 60 Seconds (Quick Test)

The free tier resets every minute. Just wait 60 seconds and try again.

**Free Tier Limits:**
- 15 requests per minute
- 1 million tokens per minute
- 1,500 requests per day

---

## OPTION 3: Use Alternative AI Provider (If Gemini keeps failing)

I can help you switch to:
- **OpenRouter** (you already have the key in .env)
- **Groq** (you already have the key in .env)
- **OpenAI** (if you have an API key)

These have more generous free tiers.

---

## 🚀 QUICK FIX SCRIPT

Save this as `restart_backend.sh` in the project root:

```bash
#!/bin/bash
echo "🛑 Stopping backend..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
sleep 2

echo "🚀 Starting backend..."
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Then run:
```bash
chmod +x restart_backend.sh
./restart_backend.sh
```

---

## 📊 Current Configuration:

**Model:** Gemini 2.0 Flash Lite
**API Key Status:** ⚠️ Rate Limited
**CORS:** ✅ Fixed
**Code:** ✅ Fixed (escaped curly braces)

---

## 🧪 Test After Fix:

1. Wait 60 seconds OR get new API key
2. Restart backend
3. Open: http://localhost:5175
4. Login: `amit@example.com` / `Customer@123`
5. Click chatbot bubble
6. Type: **"Book a car in Bengaluru tomorrow"**

---

## ⚡ FASTEST SOLUTION (30 seconds):

```bash
# 1. Get new API key from: https://aistudio.google.com/apikey

# 2. Update .env
nano backend/.env
# Replace GEMINI_API_KEY line with new key
# Press Ctrl+X, then Y, then Enter

# 3. Restart
lsof -ti:8000 | xargs kill -9
cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🆘 If Still Not Working:

**Check backend logs:**
```bash
tail -f /tmp/sigfleet_backend.log
```

**Test API key manually:**
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY" | grep displayName
```

**Check if backend is running:**
```bash
curl http://localhost:8000/api/health
```

---

## 💡 RECOMMENDED: Switch to OpenRouter (More Reliable)

OpenRouter has better rate limits and multiple model options. I can help you switch if Gemini keeps failing.

Your `.env` already has:
```
OPENROUTER_API_KEY=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
```

Let me know if you want to use this instead!
