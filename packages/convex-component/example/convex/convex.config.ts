import { defineApp } from "convex/server";
import wompi from "@pulgueta/wompi/convex.config.js";

const app = defineApp();
app.use(wompi, { httpPrefix: "/comments/" });

export default app;
