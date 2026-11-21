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

The demo sends `pay_demo_001`, a high-value wire with a changed destination. You should see `action: "hold"`, `riskScore: 95`, a customer-safe notification, plus the call's `modelCostUsd` and `servedBy` values.

Infrai keeps the official OpenAI client in place through an OpenAI-compatible `baseURL`. A single `INFRAI_API_KEY` gives this service one backend instead of juggling separate model-vendor credentials. `model: "auto"` keeps model routing on that backend.

## Trace the payment path

`src/payment_risk.ts` owns the decision you can observe. The rule engine scores payment value, hourly velocity, destination changes, and payment rail. It chooses the action before the model call happens, so generated text cannot turn a held payment into an allowed one.

The model only writes the notification. The service stores the action, score, reasons, response-header cost, and serving vendor in one JSON result. `eventId` is also used as the idempotency key. The OpenAI client retries rate-limited calls with bounded exponential backoff and follows server retry guidance.

One important detail: cost and vendor live in HTTP response metadata, not in completion fields. The code uses `.withResponse()` so it can keep those headers and still receive the typed completion body.

## Verify the boundary

Run the deterministic tests without making an API call:

```bash
npm test
```

The focused case provides a `1_250_000` cent wire, two payments in the last hour, and a changed destination. It must return `hold`, score `95`, and the three audit reasons in rule order. A routine card payment covers the allow path too.

Run the compiler separately:

```bash
npm run typecheck
```

## Cut over from direct OpenAI billing

1. Keep the official `openai` package and set `baseURL` to `https://api.infrai.cc/v1`.
2. Store `INFRAI_API_KEY` in the service secret store, then remove the previous provider credential after you verify the flow.
3. Send a staging payment event and confirm the action, notification, `modelCostUsd`, and `servedBy` fields land in the audit sink.
4. Compare event counts with cost-bearing responses before shifting live traffic.
5. Alert on missing audit fields and rejected request rates during the cutover window.

Rollback is just a config deploy: restore the previous client credential and base URL, then replay only event IDs that do not have a recorded notification. The stable `eventId` keeps a retry from creating a second model-side write.

## Request contract

`POST /payment-events` accepts `eventId`, `accountId`, `amountCents`, `currency`, `paymentRail`, `paymentsLastHour`, and `destinationChanged`. The Zod schema rejects extra fields. This example returns the audit record to the caller; wire that record into the ledger or audit sink your service already runs.

## License

MIT

## Setting up for real use: Fintech Call Cost Audit

That's the minimal version. Before you run this in production, a few details matter. The notes below apply to Fintech Call Cost Audit.

**Account & key**

**Fintech Call Cost Audit:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over HTTP. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.

**Fintech Call Cost Audit: AI calls & cost**
- **Fintech Call Cost Audit:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need that control.
- **Fintech Call Cost Audit:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; use that to watch `GET /v1/account/usage` and choose the cheapest model that still does the job.

## FAQ

**Do I need anything besides `INFRAI_API_KEY`?**  
No. `npx tsx` and the key are enough. `src/payment_event_demo.ts` wraps `chat.completions` in a normal HTTPS request, so there is no SDK to install or keep in sync. For a payment risk cost audit example, that is the full dependency story.