/// <reference types="vite/client" />
import { test } from "vitest";
import { convexTest } from "convex-test";
export const modules = import.meta.glob("./**/*.*s");

import { type GenericSchema, type SchemaDefinition } from "convex/server";
import { type ComponentApi } from "../component/_generated/component.js";
import { componentsGeneric } from "convex/server";
import { register } from "../test.js";
import { appSchema } from "./callbacks.test.js";

export {
  appSchema,
  dispersionCallback,
  paymentCallback,
} from "./callbacks.test.js";

export function initConvexTest<
  Schema extends SchemaDefinition<GenericSchema, boolean> = typeof appSchema,
>(schema?: Schema) {
  const t = convexTest((schema ?? appSchema) as Schema, modules);
  register(t);
  return t;
}
export const components = componentsGeneric() as unknown as {
  wompi: ComponentApi;
};

test("setup", () => {});
