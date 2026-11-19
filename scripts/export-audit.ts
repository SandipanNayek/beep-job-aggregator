import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getJobsCollection, getTelemetryCollection } from "../src/lib/db";

const INPUT_COST_PER_M = 0.25;
const OUTPUT_COST_PER_M = 1.5;

function escapeCsv(val: string | number | undefined): string {
  const str = String(val ?? "").replace(/"/g, '""');
  return `"${str}"`;
}

async function main() {
  const jobsCol = await getJobsCollection();
  const telemetryCol = await getTelemetryCollection();

  const jobs = await jobsCol.find({}).sort({ scrapedAt: -1 }).toArray();
  const telemetryRuns = await telemetryCol.find({}).sort({ runAt: -1 }).toArray();

  const outDir = path.join(process.cwd(), "audit-output");
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Export all 200+ tagged jobs
  const allHeaders = [
    "Dedup Hash",
    "Source",
    "Company",
    "Raw Title",
    "Raw Location",
    "LLM Role",
    "LLM City",
    "Job Type",
    "Apply URL",
    "Scraped At",
  ];
  const allRows = jobs.map((j) =>
    [
      j.dedupHash.slice(0, 12),
      j.source,
      j.company,
      j.rawTitle,
      j.rawLocation,
      j.role,
      j.city,
      j.jobType,
      j.applyUrl,
      j.scrapedAt,
    ]
      .map(escapeCsv)
      .join(",")
  );
  fs.writeFileSync(
    path.join(outDir, "all_jobs.csv"),
    [allHeaders.join(","), ...allRows].join("\n"),
    "utf8"
  );

  // 2. Shuffle and pick 50 random posts for manual accuracy verification
  const shuffled = [...jobs].sort(() => Math.random() - 0.5);
  const sample50 = shuffled.slice(0, 50);

  const auditHeaders = [
    "Sample #",
    "Company",
    "Raw Title",
    "Raw Location",
    "LLM Role",
    "Human Verified Role",
    "Role Correct (1/0)",
    "LLM City",
    "Human Verified City",
    "City Correct (1/0)",
    "Apply URL",
    "Audit Notes",
  ];
  const auditRows = sample50.map((j, idx) =>
    [
      idx + 1,
      j.company,
      j.rawTitle,
      j.rawLocation,
      j.role,
      "",
      "",
      j.city,
      "",
      "",
      j.applyUrl,
      "",
    ]
      .map(escapeCsv)
      .join(",")
  );
  fs.writeFileSync(
    path.join(outDir, "random_50_audit.csv"),
    [auditHeaders.join(","), ...auditRows].join("\n"),
    "utf8"
  );

  // 3. Calculate exact cost per 1,000 posts from logged telemetry
  const totalPosts = telemetryRuns.reduce((s, r) => s + r.postsProcessed, 0);
  const totalPrompt = telemetryRuns.reduce((s, r) => s + r.promptTokens, 0);
  const totalOutput = telemetryRuns.reduce((s, r) => s + r.outputTokens, 0);

  const avgPromptPerPost = totalPosts ? totalPrompt / totalPosts : 0;
  const avgOutputPerPost = totalPosts ? totalOutput / totalPosts : 0;

  const costPer1000PostsUsd =
    ((avgPromptPerPost * 1000) / 1_000_000) * INPUT_COST_PER_M +
    ((avgOutputPerPost * 1000) / 1_000_000) * OUTPUT_COST_PER_M;

  const summary = {
    model: telemetryRuns[0]?.model || "gemini-3.1-flash-lite",
    pricingRates: {
      inputPer1MTokensUsd: INPUT_COST_PER_M,
      outputPer1MTokensUsd: OUTPUT_COST_PER_M,
    },
    totalActiveJobsInDb: jobs.length,
    totalPostsClassifiedAcrossRuns: totalPosts,
    totalPromptTokens: totalPrompt,
    totalOutputTokens: totalOutput,
    avgPromptTokensPerPost: Number(avgPromptPerPost.toFixed(2)),
    avgOutputTokensPerPost: Number(avgOutputPerPost.toFixed(2)),
    estimatedCostPer1000PostsUsd: Number(costPer1000PostsUsd.toFixed(4)),
    estimatedCostPer1000PostsInr: Number((costPer1000PostsUsd * 84.5).toFixed(2)),
  };

  fs.writeFileSync(
    path.join(outDir, "token_cost_summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log("=== AUDIT FILES GENERATED IN /audit-output ===");
  console.log(`1. all_jobs.csv (${jobs.length} rows)`);
  console.log(`2. random_50_audit.csv (${sample50.length} rows)`);
  console.log(`3. token_cost_summary.json -> $${summary.estimatedCostPer1000PostsUsd} per 1,000 posts`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Audit export failed:", err);
  process.exit(1);
});
