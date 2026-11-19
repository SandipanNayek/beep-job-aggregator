"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CITY_CATEGORIES,
  JobDocument,
  ROLE_CATEGORIES,
} from "@/lib/schema";

const PAGE_SIZE = 30;

function decodeText(text: string): string {
  return (text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export default function HomePage() {
  const [jobs, setJobs] = useState<JobDocument[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("All");
  const [selectedCity, setSelectedCity] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    async function loadJobs() {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setLastRefreshed(data.lastRefreshed || null);
      } catch (err) {
        console.error("Error fetching jobs:", err);
        setError("Could not load jobs. Check that MongoDB is connected.");
      } finally {
        setLoading(false);
      }
    }
    loadJobs();
  }, []);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (selectedRole !== "All" && job.role !== selectedRole) return false;
      if (selectedCity !== "All" && job.city !== selectedCity) return false;
      if (selectedType !== "All" && job.jobType !== selectedType) return false;
      if (!q) return true;

      return (
        job.rawTitle.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.role.toLowerCase().includes(q) ||
        job.city.toLowerCase().includes(q) ||
        job.descriptionSnippet.toLowerCase().includes(q)
      );
    });
  }, [jobs, searchQuery, selectedRole, selectedCity, selectedType]);

  const displayedJobs = useMemo(
    () => filteredJobs.slice(0, visibleCount),
    [filteredJobs, visibleCount]
  );

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedRole("All");
    setSelectedCity("All");
    setSelectedType("All");
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <main className="min-h-screen w-full bg-[#0d0f14] text-slate-100 antialiased">
      <header className="border-b border-slate-800 bg-[#13151c]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                AI-Tagged | Auto-Refreshed Daily
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                India Fresher &amp; Internship Radar
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Verified entry-level roles aggregated from public company career boards and classified by Gemini.
              </p>
            </div>

            <div className="shrink-0 rounded-xl border border-slate-800 bg-[#0d0f14] px-4 py-3 sm:text-right">
              <div className="text-sm font-semibold text-white">
                {loading ? "Loading..." : `${jobs.length} Active Fresher Roles`}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {lastRefreshed
                  ? `Last refreshed: ${new Date(lastRefreshed).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })} IST`
                  : "Syncing feed..."}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Search by job title, company, or skill (e.g. SDE, Python, Analyst, Intern)..."
              className="w-full rounded-lg border border-slate-700 bg-[#0d0f14] px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="rounded-lg border border-slate-700 bg-[#0d0f14] px-4 py-2.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none sm:w-56"
            >
              <option value="All">All Opportunity Types</option>
              <option value="Internship">Internships Only</option>
              <option value="Full-Time (Fresher)">Full-Time (Fresher)</option>
            </select>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Filter by Role
            </p>
            <div className="flex flex-wrap gap-2">
              {["All", ...ROLE_CATEGORIES].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setSelectedRole(role);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    selectedRole === role
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-700 bg-[#0d0f14] text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Filter by City
            </p>
            <div className="flex flex-wrap gap-2">
              {["All", ...CITY_CATEGORIES].map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => {
                    setSelectedCity(city);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    selectedCity === city
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-700 bg-[#0d0f14] text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Showing{" "}
            <span className="font-semibold text-white">{displayedJobs.length}</span>{" "}
            of{" "}
            <span className="font-semibold text-white">{filteredJobs.length}</span>{" "}
            matching roles
          </p>
          {(searchQuery ||
            selectedRole !== "All" ||
            selectedCity !== "All" ||
            selectedType !== "All") && (
            <button
              type="button"
              onClick={resetFilters}
              className="cursor-pointer text-xs font-medium text-indigo-400 hover:underline"
            >
              Reset all filters
            </button>
          )}
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
            {error}
          </div>
        ) : loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-52 animate-pulse rounded-xl border border-slate-800 bg-[#13151c] p-5"
              />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-[#13151c] p-12 text-center">
            <p className="text-base font-medium text-white">No matching jobs found</p>
            <p className="mt-1 text-sm text-slate-400">
              Try clearing your search term or switching Role/City filters.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedJobs.map((job) => (
                <article
                  key={job.dedupHash}
                  className="flex min-w-0 flex-col justify-between rounded-xl border border-slate-800 bg-[#13151c] p-5 transition hover:border-slate-600"
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold uppercase tracking-wide text-indigo-400">
                        {decodeText(job.company)}
                      </span>
                      <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                        {job.jobType}
                      </span>
                    </div>

                    <h2
                      title={decodeText(job.rawTitle)}
                      className="mt-2 line-clamp-2 min-h-[3rem] break-words text-base font-semibold leading-snug text-white"
                    >
                      {decodeText(job.rawTitle)}
                    </h2>

                    <p
                      title={decodeText(job.rawLocation)}
                      className="mt-1.5 truncate text-xs text-slate-400"
                    >
                      {decodeText(job.rawLocation)}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-md bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
                        {job.role}
                      </span>
                      <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                        {job.city}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-3">
                    <span className="text-[11px] capitalize text-slate-500">
                      via {job.source}
                    </span>
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-200"
                    >
                      Apply Now
                      <span aria-hidden="true">-&gt;</span>
                    </a>
                  </div>
                </article>
              ))}
            </div>

            {visibleCount < filteredJobs.length && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="cursor-pointer rounded-lg border border-slate-700 bg-[#13151c] px-6 py-2.5 text-sm font-medium text-white transition hover:border-indigo-500 hover:bg-slate-800"
                >
                  Load More ({filteredJobs.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
