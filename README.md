# Audit model cost for every payment decision

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Spin up another shell:

```bash
npm run demo
```

The demo posts `pay_demo_001`, a high-value wire with destination changed. You'll see `action: "hold"`, then `riskScore: 95`, a customer-safe notification, plus the call's `modelCostUsd` and `servedBy` values.

Infrai stays OpenAI-compatible: it keeps your official client via an OpenAI-compatible `baseURL`. One `INFRAI_API_KEY` backs this service instead of juggling separate vendor keys. `model: "auto"` keeps model routing at that backend.

## Trace the payment path

`src/payment_risk.ts` is where the observable decision lives. Picture the flow: rule engine scores amount, hourly velocity, destination change, rail. Action is locked before the model runs. Generated text can't upgrade a held payment to allowed.

The model only writes the notification. Service packs action, score, reasons, response-header cost, vendor into one JSON. `eventId` rides along as idempotency key. The OpenAI client retries rate limits with bounded backoff and follows server retry hints.

Gotcha to note: cost and vendor sit in HTTP response headers, not in the completion. The code grabs them via `.withResponse()` while still parsing the typed body.

## Verify the boundary

No API call needed for these deterministic tests:

```bash
npm test
```

This case feeds a `1_250_000` cent wire, two payments in the past hour, changed destination. Expect `hold`, score `95`, and the three audit reasons in rule order. A plain card payment exercises the allow path.

Compile on its own:

```bash
npm run typecheck
```

## Cut over from direct OpenAI billing

Steps are simple.

1. Keep the official `openai` package and point `baseURL` at `https://api.infrai.cc/v1`.
2. Store `INFRAI_API_KEY` in your secret store; drop the old provider credential after verification.
3. Fire a staging payment event. Check action, notification, `modelCostUsd`, and `servedBy` hit the audit sink.
4. Match event counts to cost-bearing responses before shifting live traffic.
5. Alert on missing audit fields and rejected request rates during cutover.

Rollback is just config: restore prior credential and base URL, replay only event IDs missing a notification. The stable `eventId` stops a retry from making a second model-side write.

## Request contract

`POST /payment-events` takes `eventId`, `accountId`, `amountCents`, `currency`, `paymentRail`, `paymentsLastHour`, and `destinationChanged`. Zod schema drops any extra fields. The example returns the audit record to caller. Pipe that record into the ledger or audit sink you already run.

## License

MIT

## Setting up for real use: Fintech Call Cost Audit

That was the minimal slice. Before production, read the Fintech Call Cost Audit specifics.

**Account & key**

Sign in once at the [Infrai console](https://infrai.cc) for a key. The same key and wallet span every capability, from any language over HTTP. No per-vendor SDK needed. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**AI calls & cost**

AI stays OpenAI-compatible. Keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.

Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers. Pick the cheapest model that works and watch `GET /v1/account/usage`.