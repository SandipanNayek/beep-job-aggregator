import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { GoogleGenAI } from "@google/genai";
import { getJobsCollection, getTelemetryCollection } from "../src/lib/db";
import {
  batchTaggingSchema,
  CityCategory,
  JobDocument,
  RoleCategory,
} from "../src/lib/schema";
import { fetchPublicIndiaRemoteFeeds } from "./fetch-public-feeds";
import {
  ATS_SOURCES,
  AtsSource,
  isFresherCandidate,
  isIndiaLocation,
} from "./sources";

interface RawCandidate {
  externalId: string;
  source: "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";
  company: string;
  rawTitle: string;
  rawLocation: string;
  descriptionSnippet: string;
  applyUrl: string;
  postedAt: string;
}

const MODEL_FALLBACKS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
];
const MODEL_ID = MODEL_FALLBACKS[0];
const BATCH_SIZE = 20;
const INPUT_COST_PER_M = 0.25;
const OUTPUT_COST_PER_M = 1.5;

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCityKey(rawLocation: string): string {
  const loc = rawLocation.toLowerCase();
  if (loc.includes("bengaluru") || loc.includes("bangalore")) return "bengaluru";
  if (
    loc.includes("delhi") ||
    loc.includes("gurgaon") ||
    loc.includes("gurugram") ||
    loc.includes("noida") ||
    loc.includes("ncr")
  )
    return "delhi-ncr";
  if (loc.includes("mumbai") || loc.includes("navi mumbai") || loc.includes("thane"))
    return "mumbai";
  if (loc.includes("hyderabad")) return "hyderabad";
  if (loc.includes("pune")) return "pune";
  if (loc.includes("chennai")) return "chennai";
  if (loc.includes("kolkata")) return "kolkata";
  if (loc.includes("remote")) return "remote";
  return "india";
}

function buildDedupHash(company: string, rawTitle: string, rawLocation: string): string {
  const normCompany = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normTitle = rawTitle
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normCity = normalizeCityKey(rawLocation);
  return crypto
    .createHash("sha256")
    .update(`${normCompany}|${normTitle}|${normCity}`)
    .digest("hex");
}

async function fetchBoard(src: AtsSource): Promise<RawCandidate[]> {
  try {
    if (src.ats === "greenhouse") {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${src.token}/jobs?content=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.jobs || []).map((j: Record<string, any>) => ({
        externalId: String(j.id),
        source: "greenhouse",
        company: src.company,
        rawTitle: j.title || "",
        rawLocation: j.location?.name || "",
        descriptionSnippet: stripHtml(j.content || "").slice(0, 450),
        applyUrl: j.absolute_url || "",
        postedAt: j.updated_at || new Date().toISOString(),
      }));
    }

    if (src.ats === "lever") {
      const res = await fetch(
        `https://api.lever.co/v0/postings/${src.token}?mode=json`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map((j: Record<string, any>) => ({
        externalId: String(j.id),
        source: "lever",
        company: src.company,
        rawTitle: j.text || "",
        rawLocation: j.categories?.location || "",
        descriptionSnippet: stripHtml(j.descriptionPlain || "").slice(0, 450),
        applyUrl: j.hostedUrl || "",
        postedAt: j.createdAt
          ? new Date(j.createdAt).toISOString()
          : new Date().toISOString(),
      }));
    }

    if (src.ats === "ashby") {
      const res = await fetch(
        `https://api.ashbyhq.com/posting-api/job-board/${src.token}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.jobs || []).map((j: Record<string, any>) => ({
        externalId: String(j.id),
        source: "ashby",
        company: src.company,
        rawTitle: j.title || "",
        rawLocation: j.location || (j.isRemote ? "Remote, India" : ""),
        descriptionSnippet: stripHtml(j.descriptionPlain || "").slice(0, 450),
        applyUrl: j.jobUrl || "",
        postedAt: j.publishedAt || new Date().toISOString(),
      }));
    }

    if (src.ats === "workable") {
      const res = await fetch(
        `https://apply.workable.com/api/v1/widget/accounts/${src.token}?details=true`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.jobs || []).map((j: Record<string, any>) => {
        const locParts = [
          j.location?.city,
          j.location?.region,
          j.location?.country,
        ].filter(Boolean);
        return {
          externalId: String(j.shortcode),
          source: "workable",
          company: src.company,
          rawTitle: j.title || "",
          rawLocation: locParts.join(", "),
          descriptionSnippet: stripHtml(j.description || "").slice(0, 450),
          applyUrl: j.url || "",
          postedAt: j.published_on || new Date().toISOString(),
        };
      });
    }

    if (src.ats === "smartrecruiters") {
      const res = await fetch(
        `https://api.smartrecruiters.com/v1/companies/${src.token}/postings?country=in&limit=100`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.content || []).map((j: Record<string, any>) => {
        const locParts = [
          j.location?.city,
          j.location?.region,
          j.location?.country,
        ].filter(Boolean);
        return {
          externalId: String(j.id),
          source: "smartrecruiters",
          company: src.company,
          rawTitle: j.name || "",
          rawLocation: locParts.join(", ") || "India",
          descriptionSnippet: `${j.department?.label || ""} ${j.experienceLevel?.label || ""}`.trim(),
          applyUrl: `https://jobs.smartrecruiters.com/${src.token}/${j.id}`,
          postedAt: j.releasedDate || new Date().toISOString(),
        };
      });
    }
  } catch {
    return [];
  }
  return [];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function classifyBatchWithRetry(
  ai: GoogleGenAI,
  batch: Array<RawCandidate & { dedupHash: string }>,
  attempt = 1
): Promise<{
  tags: Array<{
    id: string;
    role: RoleCategory;
    city: CityCategory;
    jobType: "Internship" | "Full-Time (Fresher)";
    isEligibleFresher: boolean;
  }>;
  promptTokens: number;
  outputTokens: number;
  modelUsed: string;
}> {
  const activeModel =
    MODEL_FALLBACKS[Math.min(attempt - 1, MODEL_FALLBACKS.length - 1)];

  const payload = batch.map((item) => ({
    id: item.dedupHash,
    company: item.company,
    title: item.rawTitle,
    location: item.rawLocation,
    snippet: item.descriptionSnippet.slice(0, 300),
  }));

  const prompt = `Classify each Indian fresher or internship job posting into a standardized role, Indian city, jobType, and fresher eligibility.
Rules:
- Map Gurgaon, Gurugram, Noida, New Delhi, Ghaziabad, Faridabad -> "Delhi NCR".
- Map Bangalore -> "Bengaluru".
- If location says Remote / Work From Home in India or Worldwide -> "Remote (India)".
- If multiple Indian cities or generic "India" are listed -> "Multiple / Pan-India".
- Set isEligibleFresher to false ONLY if the snippet explicitly requires 3+ years of prior full-time experience or senior leadership.

Posts to classify:
${JSON.stringify(payload)}`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: batchTaggingSchema,
          temperature: 0.1,
        },
      }),
      30000
    );

    const parsed = JSON.parse(response.text || '{"tags":[]}');
    return {
      tags: parsed.tags || [],
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      modelUsed: activeModel,
    };
  } catch (err) {
    console.warn(`Batch attempt ${attempt} (${activeModel}) issue:`, (err as Error).message);
    if (attempt < MODEL_FALLBACKS.length) {
      await new Promise((r) => setTimeout(r, 2500 * attempt));
      return classifyBatchWithRetry(ai, batch, attempt + 1);
    }
    throw err;
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in environment");
  }

  console.log(`Fetching jobs from ${ATS_SOURCES.length} public ATS boards + remote feeds...`);
  const [boardResults, publicFeedJobs] = await Promise.all([
    Promise.all(ATS_SOURCES.map(fetchBoard)),
    fetchPublicIndiaRemoteFeeds(),
  ]);
  const allFetched = [...boardResults.flat(), ...publicFeedJobs];
  console.log(`Total raw postings fetched across all sources: ${allFetched.length}`);

  const seenHashes = new Set<string>();
  const seenUrls = new Set<string>();
  const candidates: Array<RawCandidate & { dedupHash: string }> = [];

  for (const post of allFetched) {
    if (!post.applyUrl || !post.rawTitle) continue;
    if (!isIndiaLocation(post.rawLocation)) continue;
    if (!isFresherCandidate(post.rawTitle, post.descriptionSnippet)) continue;

    const dedupHash = buildDedupHash(post.company, post.rawTitle, post.rawLocation);
    if (seenHashes.has(dedupHash) || seenUrls.has(post.applyUrl)) continue;

    seenHashes.add(dedupHash);
    seenUrls.add(post.applyUrl);
    candidates.push({ ...post, dedupHash });
  }

  const jobsCol = await getJobsCollection();
  const existingDocs = await jobsCol.find({}, { projection: { dedupHash: 1 } }).toArray();
  const existingHashSet = new Set(existingDocs.map((d) => d.dedupHash));
  const newCandidates = candidates.filter((c) => !existingHashSet.has(c.dedupHash));

  console.log(
    `Already in DB: ${existingHashSet.size} | New unseen candidates to tag: ${newCandidates.length}`
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let totalUpserted = 0;
  let totalProcessed = 0;
  let totalPromptTokens = 0;
  let totalOutputTokens = 0;
  const scrapedAt = new Date().toISOString();

  for (let i = 0; i < newCandidates.length; i += BATCH_SIZE) {
    const batch = newCandidates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(newCandidates.length / BATCH_SIZE);

    console.log(`Tagging batch ${batchNum}/${totalBatches} (${batch.length} posts)...`);
    try {
      const { tags, promptTokens, outputTokens, modelUsed } =
        await classifyBatchWithRetry(ai, batch);

      totalPromptTokens += promptTokens;
      totalOutputTokens += outputTokens;
      totalProcessed += batch.length;

      const tagMap = new Map(tags.map((t) => [t.id, t]));
      const batchDocs: JobDocument[] = [];

      for (const item of batch) {
        const tag = tagMap.get(item.dedupHash);
        if (!tag || !tag.isEligibleFresher) continue;

        batchDocs.push({
          dedupHash: item.dedupHash,
          externalId: item.externalId,
          source: item.source,
          company: item.company,
          rawTitle: item.rawTitle,
          rawLocation: item.rawLocation,
          descriptionSnippet: item.descriptionSnippet,
          applyUrl: item.applyUrl,
          role: tag.role,
          city: tag.city,
          jobType: tag.jobType,
          postedAt: item.postedAt,
          scrapedAt,
        });
      }

      if (batchDocs.length > 0) {
        const ops = batchDocs.map((doc) => ({
          updateOne: {
            filter: { dedupHash: doc.dedupHash },
            update: { $set: doc },
            upsert: true,
          },
        }));
        await jobsCol.bulkWrite(ops, { ordered: false });
        totalUpserted += batchDocs.length;
      }

      console.log(`  -> Saved ${batchDocs.length} jobs using ${modelUsed}`);
    } catch (err) {
      console.error(`  -> Skipping batch ${batchNum} after all retries:`, (err as Error).message);
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await jobsCol.deleteMany({ scrapedAt: { $lt: thirtyDaysAgo } });

  const totalActiveInDb = await jobsCol.countDocuments();

  if (totalProcessed > 0) {
    const telemetryCol = await getTelemetryCollection();
    await telemetryCol.insertOne({
      runAt: scrapedAt,
      model: MODEL_ID,
      postsProcessed: totalProcessed,
      postsAccepted: totalUpserted,
      promptTokens: totalPromptTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalPromptTokens + totalOutputTokens,
    });
  }

  const avgInPerPost = totalProcessed ? totalPromptTokens / totalProcessed : 0;
  const avgOutPerPost = totalProcessed ? totalOutputTokens / totalProcessed : 0;
  const costPer1000 =
    ((avgInPerPost * 1000) / 1_000_000) * INPUT_COST_PER_M +
    ((avgOutPerPost * 1000) / 1_000_000) * OUTPUT_COST_PER_M;

  console.log("\n=== INGESTION COMPLETE ===");
  console.log(`Newly verified & upserted: ${totalUpserted}`);
  console.log(`Total active jobs in MongoDB: ${totalActiveInDb}`);
  console.log(`Prompt tokens: ${totalPromptTokens} | Output tokens: ${totalOutputTokens}`);
  console.log(`Estimated cost per 1,000 posts (${MODEL_ID}): $${costPer1000.toFixed(4)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
