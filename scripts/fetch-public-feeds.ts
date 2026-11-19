export interface PublicFeedJob {
  externalId: string;
  source: "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";
  company: string;
  rawTitle: string;
  rawLocation: string;
  descriptionSnippet: string;
  applyUrl: string;
  postedAt: string;
}

export async function fetchPublicIndiaRemoteFeeds(): Promise<PublicFeedJob[]> {
  const results: PublicFeedJob[] = [];

  // 1. Jobicy public API (India + APAC + Anywhere remote)
  for (const geo of ["india", "apac", "anywhere"]) {
    try {
      const res = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=50&geo=${geo}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const j of data.jobs || []) {
        const rawGeo = String(j.jobGeo || "Remote");
        results.push({
          externalId: `jobicy-${j.id}`,
          source: "workable",
          company: j.companyName || "Remote Tech",
          rawTitle: j.jobTitle || "",
          rawLocation: /\bindia\b/i.test(rawGeo) ? rawGeo : `${rawGeo} - Remote (India)`,
          descriptionSnippet: String(j.jobExcerpt || "").replace(/<[^>]*>/g, " ").slice(0, 450),
          applyUrl: j.url || "",
          postedAt: j.pubDate || new Date().toISOString(),
        });
      }
    } catch {}
  }

  // 2. Remotive public API (India / Worldwide / APAC remote)
  try {
    const res = await fetch("https://remotive.com/api/remote-jobs?limit=200", {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const j of data.jobs || []) {
        const loc = String(j.candidate_required_location || "");
        if (!/\b(india|worldwide|anywhere|apac|asia)\b/i.test(loc)) continue;
        results.push({
          externalId: `remotive-${j.id}`,
          source: "ashby",
          company: j.company_name || "Remote Company",
          rawTitle: j.title || "",
          rawLocation: loc.toLowerCase().includes("india") ? loc : `${loc} (Remote India)`,
          descriptionSnippet: String(j.description || "").replace(/<[^>]*>/g, " ").slice(0, 450),
          applyUrl: j.url || "",
          postedAt: j.publication_date || new Date().toISOString(),
        });
      }
    }
  } catch {}

  // 3. Himalayas public API (Remote Worldwide / India eligible)
  try {
    const res = await fetch("https://himalayas.app/jobs/api?limit=100", {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const j of data.jobs || []) {
        const restrictions: string[] = Array.isArray(j.locationRestrictions)
          ? j.locationRestrictions
          : [];
        const allowsIndia =
          restrictions.length === 0 ||
          restrictions.some((r) => /\b(india|worldwide|anywhere|apac|asia)\b/i.test(r));
        if (!allowsIndia) continue;

        results.push({
          externalId: `himalayas-${j.guid || j.applicationLink}`,
          source: "ashby",
          company: j.companyName || "Remote Startup",
          rawTitle: j.title || "",
          rawLocation:
            restrictions.length > 0
              ? `${restrictions.join(", ")} (Remote India)`
              : "Worldwide - Remote (India)",
          descriptionSnippet: String(j.excerpt || "").replace(/<[^>]*>/g, " ").slice(0, 450),
          applyUrl: j.applicationLink || j.guid || "",
          postedAt: j.pubDate
            ? new Date(j.pubDate * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    }
  } catch {}

  // 4. RemoteOK public API (Worldwide / India eligible)
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "BeepFresherJobRadar/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const j of Array.isArray(data) ? data.slice(1) : []) {
        const loc = String(j.location || "Worldwide");
        if (loc && !/\b(india|worldwide|anywhere|global|remote|apac|asia)\b/i.test(loc)) continue;
        results.push({
          externalId: `remoteok-${j.id}`,
          source: "workable",
          company: j.company || "Remote Tech",
          rawTitle: j.position || "",
          rawLocation: /\bindia\b/i.test(loc) ? loc : `${loc} - Remote (India)`,
          descriptionSnippet: String(j.description || "").replace(/<[^>]*>/g, " ").slice(0, 450),
          applyUrl: j.apply_url || j.url || "",
          postedAt: j.date || new Date().toISOString(),
        });
      }
    }
  } catch {}

  // 5. Arbeitnow public Job Board API (pages 1-6)
  for (const page of [1, 2, 3, 4, 5, 6]) {
    try {
      const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const j of data.data || []) {
        const loc = String(j.location || "");
        const isRemote = Boolean(j.remote);
        if (!isRemote && !/\bindia\b/i.test(loc)) continue;
        results.push({
          externalId: `arbeitnow-${j.slug}`,
          source: "lever",
          company: j.company_name || "Tech Startup",
          rawTitle: j.title || "",
          rawLocation: /\bindia\b/i.test(loc) ? loc : `${loc} - Remote (India)`,
          descriptionSnippet: String(j.description || "").replace(/<[^>]*>/g, " ").slice(0, 450),
          applyUrl: j.url || "",
          postedAt: j.created_at
            ? new Date(j.created_at * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    } catch {}
  }

  return results;
}
