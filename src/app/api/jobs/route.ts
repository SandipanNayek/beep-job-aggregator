import { NextResponse } from "next/server";
import { getJobsCollection } from "@/lib/db";

export async function GET() {
  try {
    const jobsCol = await getJobsCollection();
    const jobs = await jobsCol
      .find({}, { projection: { _id: 0 } })
      .sort({ scrapedAt: -1, postedAt: -1 })
      .toArray();

    const lastRefreshed = jobs.length > 0 ? jobs[0].scrapedAt : null;

    return NextResponse.json(
      {
        totalCount: jobs.length,
        lastRefreshed,
        jobs,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Failed to load jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
