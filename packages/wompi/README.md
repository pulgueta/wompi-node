## @pulgueta/wompi

Wompi SDK for Node.js and the browser. Modeled after the clarity of the Resend SDK.

### Install

```bash
pnpm add @pulgueta/wompi
```

### Usage

```ts
import { Wompi, WompiServer } from "@pulgueta/wompi";

const wompi = new Wompi({ publicKey: process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY! });

const { data } = await wompi.merchants.authenticate();

const tx = await wompi.transactions.getTransaction("123");

// server only
const signature = await WompiServer.getSignatureKey("order-1", 10000, process.env.WOMPI_INTEGRITY!);
```

