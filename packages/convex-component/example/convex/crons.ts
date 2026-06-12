import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

// Every minute keeps the demo snappy; 10–15 minutes is plenty in production
// (renewals tolerate hours of slack, and webhooks resolve pendings sooner).
crons.interval("wompi billing", { minutes: 1 }, internal.billing.run, {});

export default crons;
