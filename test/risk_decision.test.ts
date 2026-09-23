import assert from "node:assert/strict";
import test from "node:test";
import { decidePaymentRisk } from "../src/payment_risk.js";

test("holds a high-value wire after a destination change", () => {
  const decision = decidePaymentRisk({
    eventId: "pay_test_001",
    accountId: "acct_test_001",
    amountCents: 1_250_000,
    currency: "USD",
    paymentRail: "wire",
    paymentsLastHour: 2,
    destinationChanged: true
  });

  assert.deepEqual(decision, {
    action: "hold",
    score: 95,
    reasons: ["high-value payment", "recent destination change", "wire transfer"]
  });
});

test("allows a routine card payment", () => {
  const decision = decidePaymentRisk({
    eventId: "pay_test_002",
    accountId: "acct_test_002",
    amountCents: 4_900,
    currency: "USD",
    paymentRail: "card",
    paymentsLastHour: 1,
    destinationChanged: false
  });

  assert.equal(decision.action, "allow");
  assert.equal(decision.score, 0);
});
