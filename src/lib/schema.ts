import { Type, Schema } from "@google/genai";

export const ROLE_CATEGORIES = [
  "Software Engineering",
  "AI / Data Science",
  "Product Management",
  "UI/UX Design",
  "Marketing & Growth",
  "Business & Operations",
  "Finance & Legal",
  "Other",
] as const;

export const CITY_CATEGORIES = [
  "Bengaluru",
  "Delhi NCR",
  "Mumbai",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Kolkata",
  "Remote (India)",
  "Multiple / Pan-India",
] as const;

export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
export type CityCategory = (typeof CITY_CATEGORIES)[number];

export interface JobDocument {
  dedupHash: string;
  externalId: string;
  source: "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters";
  company: string;
  rawTitle: string;
  rawLocation: string;
  descriptionSnippet: string;
  applyUrl: string;
  role: RoleCategory;
  city: CityCategory;
  jobType: "Internship" | "Full-Time (Fresher)";
  postedAt: string;
  scrapedAt: string;
}

export interface TelemetryDocument {
  runAt: string;
  model: string;
  postsProcessed: number;
  postsAccepted: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export const batchTaggingSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    tags: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          role: {
            type: Type.STRING,
            enum: [...ROLE_CATEGORIES],
          },
          city: {
            type: Type.STRING,
            enum: [...CITY_CATEGORIES],
          },
          jobType: {
            type: Type.STRING,
            enum: ["Internship", "Full-Time (Fresher)"],
          },
          isEligibleFresher: {
            type: Type.BOOLEAN,
            description:
              "True if suitable for students, interns, or graduates with 0-2 years of experience.",
          },
        },
        required: ["id", "role", "city", "jobType", "isEligibleFresher"],
      },
    },
  },
  required: ["tags"],
};