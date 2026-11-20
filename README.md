# India Fresher & Internship Radar

An automated, daily-refreshing job aggregator for Indian entry-level and internship roles, built with **Next.js**, **MongoDB Atlas**, **Google Gemini**, and **GitHub Actions**.

## Live Links
- **Live Web App:** <your-vercel-url>
- **Data Audit & Cost Sheet:** https://docs.google.com/spreadsheets/d/1h7lWuhlHbmNbK71oalFRswOksNxgx83sSGD5ZsWNZOo/edit?usp=sharing

## Architecture & Pipeline
1. **Multi-Source Ingestion (`scripts/ingest.ts`):** Queries 250+ public ATS boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters) and India-eligible remote feeds in parallel with 10s `AbortSignal` timeouts.
2. **Pre-Filtering & Deduplication:** Filters for Indian locations and entry-level signals, then generates a normalized SHA-256 `dedupHash` (`company | normalized_title | city`) enforced by a unique MongoDB index.
3. **Batched LLM Classification:** Classifies 20 postings per request using `gemini-3.1-flash-lite` with structured JSON schema output (`role`, `city`, `jobType`, `isEligibleFresher`), backed by a 5-model automatic fallback chain (`gemini-3.1-flash-lite` -> `gemini-3.5-flash-lite` -> `gemini-3.5-flash` -> `gemini-3.6-flash` -> `gemini-3.7-flash`) and per-batch MongoDB upserts.
4. **Daily Auto-Refresh:** Scheduled via GitHub Actions (`.github/workflows/daily-ingest.yml`) every day at 7:30 AM IST (`0 2 * * *` UTC) and prunes listings older than 30 days.

## Unit Economics
- **Model:** `gemini-3.1-flash-lite` ($0.25 / 1M input tokens, $1.50 / 1M output tokens)
- **Measured Cost:** ~$0.21 per 1,000 job postings
