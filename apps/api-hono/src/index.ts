import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { Wompi, WompiServer } from '@pulgueta/wompi';

const app = new Hono();

const WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY ?? '';
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY ?? '';
const WOMPI_ENV = (process.env.WOMPI_ENV as 'sandbox' | 'production') ?? 'sandbox';

const wompi = new Wompi({ privateKey: WOMPI_PRIVATE_KEY, publicKey: WOMPI_PUBLIC_KEY, environment: WOMPI_ENV });

app.get('/health', (c) => c.json({ ok: true }));

app.get('/acceptance-token', async (c) => {
  const data = await wompi.merchants.authenticate();
  return c.json(data);
});

app.post('/signature', async (c) => {
  const body = await c.req.json();
  const schema = z.object({ orderId: z.string(), orderTotal: z.number() });
  const { orderId, orderTotal } = schema.parse(body);
  const integrity = process.env.WOMPI_INTEGRITY_KEY ?? '';
  const signature = await WompiServer.getSignatureKey(orderId, orderTotal, integrity);
  return c.json({ signature });
});

const port = Number(process.env.PORT ?? 8787);
console.log(`listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });

