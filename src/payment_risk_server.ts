import { createServer, type ServerResponse } from "node:http";
import OpenAI from "openai";
import { ZodError } from "zod";
import { PaymentEvent, createInfraiClient, processPaymentEvent } from "./payment_risk.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = createInfraiClient(apiKey);
const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/payment-events") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const event = PaymentEvent.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    send(response, 200, await processPaymentEvent(client, event));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid payment event" });
      return;
    }
    if (error instanceof OpenAI.APIError && error.status && error.status < 500) {
      send(response, error.status, { error: error.message });
      return;
    }
    send(response, 502, { error: "Notification provider request failed" });
  }
});

server.listen(port, () => console.log(`payment-risk service listening on http://localhost:${port}`));
