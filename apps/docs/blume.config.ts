import { defineConfig } from "blume";

export default defineConfig({
  title: "@pulgueta/wompi",
  description:
    "A fully typed, error-first Wompi SDK for Node.js, with transactions, tokens, payment sources, payment links, and PSE.",
  logo: {
    image: "/favicon.svg",
    text: "@pulgueta/wompi",
  },
  content: {
    root: "content",
    pages: "pages",
  },
  github: {
    owner: "pulgueta",
    repo: "wompi-node",
    dir: "apps/docs",
  },
  navigation: {
    sidebar: [
      "/",
      {
        label: "Getting Started",
        items: ["/docs/introduction", "/docs/installation", "/docs/quickstart"],
      },
      {
        label: "Core Concepts",
        items: ["/docs/error-handling", "/docs/integrity-signature"],
      },
      {
        label: "API Reference",
        items: [
          "/docs/merchants",
          "/docs/transactions",
          "/docs/tokens",
          "/docs/payment-sources",
          "/docs/payment-links",
          "/docs/pse",
          "/docs/breb",
        ],
      },
      {
        label: "Examples",
        items: [
          "/docs/examples/card-checkout",
          "/docs/examples/payment-link",
          "/docs/examples/breb-payout",
        ],
      },
      {
        label: "Reference",
        items: ["/docs/package-exports"],
      },
    ],
  },
  theme: {
    accent: "green",
    radius: "md",
    mode: "system",
    fonts: {
      display: "geist",
      body: "geist",
      mono: "geist-mono",
    },
  },
  search: {
    provider: "orama",
  },
  markdown: {
    imageZoom: true,
    code: {
      icons: true,
      wrap: false,
    },
    codeBlocks: {
      theme: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
  ai: {
    llmsTxt: true,
  },
  seo: {
    agentReadability: true,
    og: { enabled: true },
    sitemap: true,
    robots: true,
    structuredData: true,
    contentSignals: {
      search: true,
      aiInput: true,
      aiTrain: true,
    },
  },
  analytics: {
    vercel: true,
  },
  deployment: {
    output: "static",
    site: "https://wompi.pulgueta.com",
  },
});
