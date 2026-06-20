# @agentpay/middleware

Express middleware that enforces **x402 micropayment verification** on any route.

Install and use this in your provider API to automatically gate your endpoints behind AgentPay payments. Any client (AI agent, developer, or tool) that sends a valid signed `X-Payment` header gets through; everyone else gets a `402 Payment Required` response with everything they need to make a payment.

## Usage

```ts
import express from 'express';
import { agentPayMiddleware } from '@agentpay/middleware';

const app = express();
app.use(express.json());

app.get('/price', agentPayMiddleware({
  listing_id: 3,                              // your listing ID in the AgentPay registry
  provider_wallet: 'abc123def456...',         // your Casper account hash
  facilitator_url: 'http://localhost:3001',   // AgentPay backend URL
  expected_price_motes: '500000',             // 0.0005 CSPR per call
}), (req, res) => {
  // Payment verified — req.paymentReceipt contains the receipt
  res.json({ price: 0.042, currency: 'USD' });
});
```

## How it works

1. **No `X-Payment` header** → returns `402` with the listing ID, price, and facilitator URL so the agent knows how to pay.
2. **Header present** → POSTs the signed x402 JSON payload to the facilitator's `/verify` endpoint.
3. **Verification fails** → returns `402` with the specific error (expired, bad signature, insufficient balance, etc.).
4. **Verification succeeds** → attaches the receipt to `req.paymentReceipt` and calls `next()` so your handler runs.

## Error codes

| Code | Meaning |
|---|---|
| `payment_expired` | The 30-second TTL on the authorization has passed |
| `duplicate_nonce` | Replay attempt — this authorization was already used |
| `invalid_signature` | Signature verification failed |
| `price_mismatch` | Payload amount doesn't match the on-chain listing price |
| `insufficient_balance` | Agent wallet is out of CSPR |
| `daily_limit_exceeded` | Agent's configured daily spend limit reached |

## Config

| Field | Type | Description |
|---|---|---|
| `listing_id` | `number` | Your listing ID in the AgentPay registry |
| `provider_wallet` | `string` | Your Casper account hash (bare 64-char hex) |
| `facilitator_url` | `string` | AgentPay backend base URL |
| `expected_price_motes` | `string` | Price per call in motes |
