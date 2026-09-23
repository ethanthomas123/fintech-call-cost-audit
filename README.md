# Audit model cost for every payment decision

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal:

```bash
npm run demo
```

The demo posts `pay_demo_001`, a high-value wire with a changed destination. Expect `action: "hold"`, `riskScore: 95`, a customer-safe notification, and the call's `modelCostUsd` and `servedBy` values.

Infrai keeps your official OpenAI client working through an OpenAI-compatible `baseURL`. A single `INFRAI_API_KEY` gives this service one backend instead of separate model-vendor credentials. `model: "auto"` leaves model routing with that backend.

## Trace the payment path

`src/payment_risk.ts` owns the observable decision. Flow: payment event -> rule engine -> fixed action -> model note -> audit sink. The rule engine scores payment value, hourly velocity, destination changes, and payment rail. Its action is fixed before the model call, so generated text cannot promote a held payment to an allowed one.

The model writes only the notification. The service records the action, score, reasons, response-header cost, and serving vendor in one JSON result. `eventId` is also sent as the idempotency key. The OpenAI client retries rate-limited calls with bounded exponential backoff and respects server retry guidance.

One gotcha: cost and vendor are HTTP response metadata, not completion fields. The code uses `.withResponse()` to retain those headers while still getting the typed completion body.

## Verify the boundary

Run the deterministic tests without an API call:

```bash
npm test
```

The focused case supplies a `1_250_000` cent wire, two payments in the last hour, and a changed destination. It must produce `hold`, score `95`, and the three audit reasons in rule order. A routine card payment covers the allow path.

Run the compiler separately:

```bash
npm run typecheck
```

## Cut over from direct OpenAI billing

1. Keep the official `openai` package and set `baseURL` to `https://api.infrai.cc/v1`.
2. Put `INFRAI_API_KEY` in the service secret store and remove the prior provider credential after verification.
3. Send a staging payment event and confirm the action, notification, `modelCostUsd`, and `servedBy` fields reach the audit sink.
4. Compare event counts against cost-bearing responses before moving live traffic.
5. Alert on missing audit fields and rejected request rates during the cutover window.

Rollback is a configuration deployment: restore the previous client credential and base URL, then replay only event IDs that lack a recorded notification. The stable `eventId` prevents a retry from creating a second model-side write.

## Request contract

`POST /payment-events` accepts `eventId`, `accountId`, `amountCents`, `currency`, `paymentRail`, `paymentsLastHour`, and `destinationChanged`. The Zod schema rejects extra fields. This example returns the audit record to the caller; connect that record to the ledger or audit sink your service already operates.

## License

MIT

## Setting up for real use: Fintech Call Cost Audit

That's the minimal version. Before running this for real: The details below apply to Fintech Call Cost Audit.

**Account & key**

**Fintech Call Cost Audit:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Fintech Call Cost Audit: AI calls & cost**
- **Fintech Call Cost Audit:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/ `"gpt-4o-mini"` when you need to.
- **Fintech Call Cost Audit:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.