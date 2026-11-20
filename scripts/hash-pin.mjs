#!/usr/bin/env node
import { randomBytes, scryptSync } from "node:crypto";

const pin = process.argv[2];
if (!pin || !/^\d{6}$/.test(pin)) {
  console.error("Usage : node scripts/hash-pin.mjs 123456");
  process.exit(1);
}
const sel = randomBytes(16).toString("hex");
const hash = scryptSync(pin, sel, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
console.log(`${sel}:${hash}`);
console.log("\n→ à recopier dans ADMIN_PIN_HASH");
