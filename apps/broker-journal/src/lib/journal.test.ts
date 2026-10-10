import assert from "node:assert/strict";
import test from "node:test";
import { calcOpenCost, calcPurchase } from "./journal";

test("purchase is entry price times quantity", () => {
  assert.equal(calcPurchase(1.446, 68.243888), 98.680662);
  assert.equal(calcPurchase(82459.7, 0.00119993), 98.945868);
});

test("cost is margin plus commission", () => {
  assert.equal(calcOpenCost(1.446, 68.243888, 2, 0.088), 49.428331);
  assert.equal(calcOpenCost(72.15, 1, 8, 2), 11.01875);
  assert.equal(calcOpenCost(82459.7, 0.00119993, 2, 0), 49.472934);
});
