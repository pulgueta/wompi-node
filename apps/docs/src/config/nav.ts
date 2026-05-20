/**
 * Sidebar navigation tree. The sidebar renders it group by group, and the
 * pagination component flattens it (see {@link flatNav}) to derive prev/next
 * links for each documentation page.
 */

export type NavLink = {
  title: string;
  href: string;
  /** Optional short label rendered as a chip next to the link. */
  badge?: string;
};

export type NavGroup = {
  title: string;
  items: NavLink[];
};

export const nav: NavGroup[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Introduction", href: "/docs/introduction" },
      { title: "Installation", href: "/docs/installation" },
      { title: "Quickstart", href: "/docs/quickstart" },
    ],
  },
  {
    title: "Core Concepts",
    items: [
      { title: "Error handling", href: "/docs/error-handling" },
      { title: "Integrity signature", href: "/docs/integrity-signature" },
    ],
  },
  {
    title: "API Reference",
    items: [
      { title: "Merchants", href: "/docs/merchants" },
      { title: "Transactions", href: "/docs/transactions" },
      { title: "Tokens", href: "/docs/tokens" },
      { title: "Payment sources", href: "/docs/payment-sources" },
      { title: "Payment links", href: "/docs/payment-links" },
      { title: "PSE", href: "/docs/pse" },
    ],
  },
  {
    title: "Examples",
    items: [
      { title: "Card checkout", href: "/docs/examples/card-checkout", badge: "Live" },
      { title: "Payment link", href: "/docs/examples/payment-link", badge: "Live" },
    ],
  },
  {
    title: "Reference",
    items: [{ title: "Package exports", href: "/docs/package-exports" }],
  },
];

/** Every documentation page in reading order — powers prev/next pagination. */
export const flatNav: NavLink[] = nav.flatMap((group) => group.items);

/** Resolve the previous and next page relative to the current pathname. */
export function getPagination(pathname: string): { prev?: NavLink; next?: NavLink } {
  const clean = pathname.replace(/\/$/, "");
  const index = flatNav.findIndex((item) => item.href === clean);

  if (index === -1) return {};

  return {
    prev: index > 0 ? flatNav[index - 1] : undefined,
    next: index < flatNav.length - 1 ? flatNav[index + 1] : undefined,
  };
}
