import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { MongoClient, Db, Collection } from "mongodb";
import { JobDocument, TelemetryDocument } from "./schema";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Missing MONGODB_URI environment variable in .env.local");
}

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  const client = new MongoClient(MONGODB_URI);
  clientPromise = client.connect();
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db("beep_fresher_jobs");
}

export async function getJobsCollection(): Promise<Collection<JobDocument>> {
  const db = await getDb();
  const collection = db.collection<JobDocument>("jobs");
  await collection.createIndex({ dedupHash: 1 }, { unique: true });
  await collection.createIndex({ applyUrl: 1 }, { unique: true });
  await collection.createIndex({ scrapedAt: -1 });
  return collection;
}

export async function getTelemetryCollection(): Promise<Collection<TelemetryDocument>> {
  const db = await getDb();
  return db.collection<TelemetryDocument>("telemetry");
}
