---
"@pulgueta/wompi": minor
---

Add BRE-B dispersals through `wompi.breb`, including payouts credentials, key resolution, batch creation and queries, paginated transaction records, and typed payout webhook guards. Verify the payouts event envelope with `verifyWebhookEvent(payload, { eventsKey, api: "payouts" })` while payment webhook types remain unchanged.
