---
"@pulgueta/wompi-convex": patch
---

Send the Credential-on-File flag on subscription charges.

The initial charge, each renewal and each dunning retry now send the
`recurrent` flag to Wompi together with the `payment_source_id`. The flag is
`true` when the amount matches the last approved charge. It is `false` when
the amount changes, for example after a plan change.

For MasterCard and VISA cards on the RBM processor, Wompi marks the charge as a
stored-credential transaction, which raises the approval rate. Wompi processes
the charge without the flag when the franchise or the processor does not
support it.

One-time checkouts do not change.
