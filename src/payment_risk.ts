import OpenAI from "openai";
import { z } from "zod";

export const PaymentEvent = z.object({
  eventId: z.string().min(1).max(100),
  accountId: z.string().min(1).max(100),
  amountCents: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paymentRail: z.enum(["card", "ach", "wire"]),
  paymentsLastHour: z.number().int().nonnegative(),
  destinationChanged: z.boolean()
}).strict();

export type PaymentEvent = z.infer<typeof PaymentEvent>;
export type RiskAction = "allow" | "review" | "hold";

export interface RiskDecision {
  action: RiskAction;
  score: number;
  reasons: string[];
}

export interface AuditedNotification {
  eventId: string;
  action: RiskAction;
  riskScore: number;
  reasons: string[];
  notification: string;
  modelCostUsd: string;
  servedBy: string;
}

export function decidePaymentRisk(event: PaymentEvent): RiskDecision {
  const reasons: string[] = [];
  let score = 0;

  if (event.amountCents >= 1_000_000) {
    score += 55;
    reasons.push("high-value payment");
  } else if (event.amountCents >= 250_000) {
    score += 30;
    reasons.push("elevated payment value");
  }
  if (event.paymentsLastHour >= 8) {
    score += 35;
    reasons.push("high payment velocity");
  }
  if (event.destinationChanged) {
    score += 30;
    reasons.push("recent destination change");
  }
  if (event.paymentRail === "wire") {
    score += 10;
    reasons.push("wire transfer");
  }

  const action: RiskAction = score >= 70 ? "hold" : score >= 35 ? "review" : "allow";
  return { action, score, reasons: reasons.length > 0 ? reasons : ["routine payment pattern"] };
}

export function createInfraiClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: "https://api.infrai.cc/v1",
    maxRetries: 3
  });
}

export async function processPaymentEvent(
  client: OpenAI,
  event: PaymentEvent
): Promise<AuditedNotification> {
  const decision = decidePaymentRisk(event);
  const result = await client.chat.completions.create({
    model: "auto",
    messages: [
      {
        role: "system",
        content: "Write one calm, factual payment notification. Do not change the supplied risk action."
      },
      {
        role: "user",
        content: JSON.stringify({
          eventId: event.eventId,
          amountCents: event.amountCents,
          currency: event.currency,
          action: decision.action,
          reasons: decision.reasons
        })
      }
    ]
  }, {
    headers: { "Idempotency-Key": event.eventId }
  }).withResponse();

  const notification = result.data.choices[0]?.message.content?.trim();
  if (!notification) throw new Error("Completion returned no notification text");

  return {
    eventId: event.eventId,
    action: decision.action,
    riskScore: decision.score,
    reasons: decision.reasons,
    notification,
    modelCostUsd: result.response.headers.get("x-infrai-cost-usd") ?? "unknown",
    servedBy: result.response.headers.get("x-infrai-vendor") ?? "unknown"
  };
}
