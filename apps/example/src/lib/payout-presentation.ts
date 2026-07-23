const FAILED_STATUSES = new Set(["DECLINED", "ERROR", "FAILED", "REJECTED"]);
const SUCCESS_STATUSES = new Set([
  "APPROVED",
  "COMPLETED",
  "SUCCESS",
  "TOTAL_PAYMENT",
]);

export function getPayoutPresentation(
  result: { failed?: number },
  status: { status: string; transactionStatus?: string } | null,
) {
  const reportedStatus = status?.transactionStatus ?? status?.status;
  const failed =
    (result.failed ?? 0) > 0 || FAILED_STATUSES.has(reportedStatus ?? "");
  const visibleStatus = failed ? "FAILED" : (reportedStatus ?? "SUBMITTED");

  return {
    visibleStatus,
    title: failed
      ? "Payout failed"
      : SUCCESS_STATUSES.has(visibleStatus)
        ? "Supplier paid"
        : "Payout submitted",
  };
}
