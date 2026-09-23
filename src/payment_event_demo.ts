async function main(): Promise<void> {
  const response = await fetch("http://localhost:3000/payment-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventId: "pay_demo_001",
      accountId: "acct_demo_017",
      amountCents: 1_250_000,
      currency: "USD",
      paymentRail: "wire",
      paymentsLastHour: 2,
      destinationChanged: true
    })
  });

  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`Request rejected with status ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
