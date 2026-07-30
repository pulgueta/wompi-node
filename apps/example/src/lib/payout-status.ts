export const TERMINAL_DISPERSION_STATUSES = new Set([
  "TOTAL_PAYMENT",
  "REJECTED",
  "CANCEL",
  "CANCELED",
  "CANCELLED",
]);

export function isTerminalDispersionStatus(status: string) {
  const normalized = status.toUpperCase();
  return (
    TERMINAL_DISPERSION_STATUSES.has(normalized) ||
    normalized.includes("FAIL") ||
    normalized.includes("ERROR") ||
    normalized.includes("REJECT") ||
    normalized.includes("CANCEL")
  );
}

export function getDispersionStatusRank(status: string) {
  const normalized = status.toUpperCase();
  if (isTerminalDispersionStatus(normalized)) return 3;
  if (normalized === "PENDING") return 0;
  if (normalized === "PROCESSING") return 1;
  return 2;
}
