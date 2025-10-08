import { Hono } from "hono";
import { WompiServer } from "@pulgueta/wompi";

const app = new Hono();

const wompi = new WompiServer({
  privateKey: process.env.WOMPI_PRIVATE_KEY || "",
  environment: (process.env.WOMPI_ENV as "sandbox" | "production") || "sandbox",
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/transactions/:id", async (c) => {
  const id = c.req.param("id");
  const tx = await wompi.transactions.getTransaction(id);
  return c.json(tx);
});

app.post("/transactions", async (c) => {
  const body = await c.req.json();
  const created = await wompi.transactions.createTransaction(body);
  return c.json(created);
});

const port = Number(process.env.PORT || 8787);
console.log(`[hono] listening on http://localhost:${port}`);
export default app;

