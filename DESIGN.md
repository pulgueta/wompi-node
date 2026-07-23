---
name: Wompi SDK Sandbox Story
description: A compact payment-to-settlement example for SDK evaluators.
colors:
  merchant-green: "#126B42"
  merchant-green-deep: "#0E5535"
  ledger-canvas: "#F3F6F4"
  surface: "#FFFFFF"
  ink: "#17211B"
  muted-ink: "#526057"
  divider: "#D5DED8"
  danger: "#A93226"
  danger-surface: "#FFF1F0"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 750
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 650
    lineHeight: 1.35
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.merchant-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.merchant-green-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "11px 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "11px 12px"
  task-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Wompi SDK Sandbox Story

## Overview

**Creative North Star: "The Settlement Desk"**

This is a focused merchant test surface, not a marketing page and not a dense operations dashboard. A developer should be able to sit down, understand the order, launch its hosted checkout, verify the result, and settle the supplier share without deciphering unrelated controls.

The system uses familiar product conventions, restrained color, and concise explanatory copy. Visual hierarchy follows the actual money flow. Motion is limited to state feedback and never delays the task.

**Key Characteristics:**

- One sequential payment-to-settlement story.
- Light, cool-neutral surfaces with one merchant-green accent.
- Familiar form controls with explicit loading, success, error, and disabled states.
- Technical detail presented as supporting evidence, not as the primary interface.

## Colors

The palette uses cool ledger neutrals and one established green accent, with red reserved strictly for errors.

### Primary

- **Merchant Green:** Primary actions, the current flow step, and verified success states.
- **Merchant Green Deep:** Hover and pressed states for primary actions.

### Neutral

- **Ledger Canvas:** The page background, chosen to separate the working surface without warm-paper styling.
- **Surface:** Forms, results, and the order summary.
- **Ledger Ink:** Primary text and identifiers.
- **Muted Ledger Ink:** Explanatory copy that still meets contrast requirements.
- **Divider:** Structural boundaries between related steps.

### Named Rules

**The One Accent Rule.** Merchant Green is the only decorative accent. Red communicates errors and nothing else.

**The State Before Color Rule.** Every status includes a text label or icon-independent message. Color may reinforce meaning but never carries it alone.

## Typography

**Display Font:** System UI sans-serif
**Body Font:** System UI sans-serif

**Character:** Familiar, compact, and legible. The interface should resemble a dependable developer tool rather than a campaign site.

### Hierarchy

- **Headline** (750, 2.25rem, 1.08): One page title, limited to two lines on narrow screens.
- **Title** (700, 1.125rem, 1.25): Flow steps, result headings, and the order name.
- **Body** (400, 1rem, 1.55): Explanations capped near 70 characters per line.
- **Label** (650, 0.875rem, 1.35): Inputs, compact metadata, and button text.

### Named Rules

**The Product Scale Rule.** Use fixed rem sizes. No oversized fluid display type inside the task flow.

## Elevation

The system is flat by default. Tonal background changes and dividers establish hierarchy. A compact shadow may appear only on the hosted-checkout call to action or a temporarily raised result, never alongside an ornamental border.

### Named Rules

**The Flat Desk Rule.** Working surfaces rest on the canvas without wide ambient shadows. If a section looks like a floating marketing card, remove the shadow.

## Components

### Buttons

- **Shape:** Firm, gently rounded corners (6px).
- **Primary:** Merchant Green with white text and compact 11px by 16px padding.
- **Hover / Focus:** Deepen the green on hover; use a visible three-pixel focus ring with two-pixel separation.
- **Secondary:** White or transparent surface with an ink divider border. Never gray text on gray fill.

### Cards / Containers

- **Corner Style:** Soft product radius (14px maximum).
- **Background:** White on the Ledger Canvas.
- **Shadow Strategy:** Flat by default, using spacing and one divider rather than ambient shadows.
- **Border:** One subtle full border only when it clarifies grouping.
- **Internal Padding:** 24px desktop, 16px narrow screens.

### Inputs / Fields

- **Style:** White background, one neutral border, 6px radius, and persistent labels above every field.
- **Focus:** Merchant Green ring with enough separation from the border.
- **Error / Disabled:** Error text sits directly below the field. Disabled controls remain readable and explain the missing prerequisite nearby.

### Navigation

- Use one compact horizontal step indicator for Order, Checkout, and Settlement. On narrow screens it becomes a vertical progress list without hiding labels.

### Transaction Result

- Preserve the transaction or payout ID, explicit status, amount in normal COP, and a recovery action. Never clear the last confirmed result while a retry begins.

## Do's and Don'ts

### Do:

- **Do** present one coherent customer-payment and supplier-settlement story.
- **Do** mark browser, server, Wompi-hosted, and webhook responsibilities in plain language.
- **Do** accept peso amounts in the UI and convert to cents once at the integration boundary.
- **Do** preserve IDs and prior confirmed states during retries.
- **Do** use the documented sandbox aliases and card values as test data, never as credentials.

### Don't:

- **Don't** build generic API playgrounds that expose unrelated endpoints without a coherent task.
- **Don't** create an imitation Wompi marketing site that competes with the official brand.
- **Don't** use decorative fintech dashboards built from metric cards, gradients, glows, or ornamental charts.
- **Don't** return to a payout-only form dump that makes developers assemble the end-to-end story themselves.
- **Don't** use gradient text, glassmorphism, side-stripe alerts, oversized radii, or wide ghost-card shadows.
