import { defineApp } from "convex/server";
import wompi from "@pulgueta/wompi-convex/convex.config.js";

const app = defineApp();
app.use(wompi);

export default app;
