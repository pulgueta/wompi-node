import { wompi } from "./wompi.js";

/**
 * One billing run: charges due renewals/trial conversions, walks dunning,
 * finalizes cancellations, reconciles stale pendings. Driven by crons.ts.
 */
export const run = wompi.billing();
