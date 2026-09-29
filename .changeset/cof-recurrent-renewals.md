---
"@pulgueta/wompi-convex": patch
---

Send the Credential-on-File flag on subscription charges.

The initial charge, each renewal and each dunning retry now send
`recurrent: true` to Wompi together with the `payment_source_id`. For
MasterCard and VISA cards on the RBM processor, Wompi marks the charge as a
stored-credential transaction, which raises the approval rate. Wompi processes
the charge without the flag when the franchise or the processor does not
support it.

One-time checkouts do not change.
