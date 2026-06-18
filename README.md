# AgentPay

> Stripe for AI agents — payment infrastructure for the autonomous AI economy, built on Casper Network.

Built for the [Casper Agentic Buildathon 2026](https://www.casper.network/) (Qualification Round, June 1–30, 2026).

## The Problem

AI agents can't pay for things. Today, calling a paid API requires a human to create an account, enter a credit card, and manage API keys — agents have no identity, no wallet, no way to prove they can pay. Subscription pricing forces massive overpayment or rate-limiting, and per-call fees on traditional payment rails make true micro-transactions (fractions of a cent) commercially impossible.

## The Solution

AgentPay is a decentralized marketplace and payment protocol that lets AI agents discover, access, and pay for APIs autonomously — no human in the loop, no pre-negotiated contracts, no subscriptions. Providers list APIs on-chain with a price per call. Agents discover them through an MCP server, then pay per request using the x402 micropayment protocol, with cryptographic proof of payment embedded directly in the HTTP request. Settlement happens in under a second. AgentPay takes a 0.5% protocol fee on every transaction.

## How It Works

1. A provider connects a Casper wallet and lists their API on-chain (name, description, endpoint, price per call).
2. An AI agent, connected to the AgentPay MCP server, searches the on-chain registry for the service it needs.
3. The agent calls the API; its wallet signs an x402 payment authorization attached to the HTTP request.
4. The provider's middleware verifies the payment proof with the AgentPay facilitator and forwards the request.
5. CSPR moves from the agent's wallet to the provider's wallet; the transaction and reputation scores are recorded on-chain.

## Architecture

Five layers: Casper smart contracts (Odra/Rust) for the on-chain registry, reputation, and payment records; the x402 payment protocol for HTTP-native settlement; an MCP server exposing marketplace discovery and payment as agent tools; lightweight provider middleware that enforces payment before passing requests through; and a Next.js dashboard for providers and agent developers.

## Tech Stack

- **Smart Contracts**: Odra (Rust) on Casper Testnet
- **Backend**: Node.js/TypeScript, Express, PostgreSQL (Supabase), Redis (Upstash)
- **MCP Server**: `@modelcontextprotocol/sdk`
- **Provider Middleware**: Express middleware, npm package
- **Frontend**: Next.js, Tailwind CSS
- **Payment Protocol**: x402 on Casper

## Repo Structure

```
agentpay/
├── contracts/          # Odra smart contracts (Rust): registry, reputation, payment
├── backend/             # Facilitator server (Node.js/TypeScript)
├── mcp-server/          # MCP server (Node.js/TypeScript)
├── middleware/          # Provider npm package
├── dashboard/            # Next.js frontend
├── demo/                  # Demo agent scripts and mock provider APIs
└── Docs/                  # Hackathon planning docs (problem, solution, user flow, architecture, roadmap)
```

## Contract Addresses (Casper Testnet)

- Registry: `contract-package-d9b87e7ea424d3e93bcde9487f842636184eb2bbb9f10b3377dc7f74a90595f3` ([deploy transaction](https://testnet.cspr.live/transaction/d5f468537557371c32cfd7e23455f6e0802a3b41cb2f7eae486bd753518a31a6))
- Reputation: `contract-package-56a5fcd172ac50c3cc06fe555fb9806409fde2c012f146803a9afc33b7d397e5` ([deploy transaction](https://testnet.cspr.live/transaction/6741965c75ef5eab22b3d9e8f988d3be4c494767055ac39d3128077a5dbcb42d))
- Payment: `contract-package-1febe8793989be4da5f83d3313b60143f2d12063688702bedc19722feb4cae25` ([deploy transaction](https://testnet.cspr.live/transaction/278bb5ca7cb062c141f7921f9564ae899c5fd7686f6b9740ffaa77c8ed8a95e6))

## Quick Start

```bash
# Contracts (requires WSL/Linux — casper-client and cargo-odra don't build on native Windows)
cd contracts/registry && cargo odra test

# Building the deployable wasm requires rebuilding std with the wasm MVP target
# (Casper's wasm runtime doesn't yet support the "bulk-memory" feature that
# Rust 1.87+ enables by default for wasm32-unknown-unknown):
CARGO_UNSTABLE_BUILD_STD=panic_abort,std cargo odra build

# Backend
cd backend && npm install && npm run dev

# MCP server
cd mcp-server && npm install && npm run dev

# Dashboard
cd dashboard && npm install && npm run dev
```

## How to Verify On-Chain

All three contracts are live on Casper Testnet and wired together: Payment calls Reputation cross-contract after every settlement, and Reputation only accepts that call from Payment's address. Query them directly (env vars are shared across contracts, only the `cd` and binary name change):

```bash
export ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network
export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
export ODRA_CASPER_LIVENET_EVENTS_URL=https://node.testnet.casper.network/events
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=../../keys/deployer_secret_key.pem

# Registry: read back a registered listing
cd contracts/registry
cargo run --bin registry_cli -- contract Registry get_listing --listing_id 1

# Payment: read back a settled transaction (fee is exactly 0.5% of gross_amount)
cd ../payment
cargo run --bin payment_cli -- contract Payment get_transaction --tx_id 0

# Reputation: read back the provider/agent scores, updated by Payment's cross-contract call
cd ../reputation
cargo run --bin reputation_cli -- contract Reputation get_provider_score --wallet_address account-hash-832467189c656e3a73531b63f401480bf9f1e72b00f449c6177d252556d127ff
cargo run --bin reputation_cli -- contract Reputation get_agent_score --wallet_address account-hash-f6df2b9fc09d2b5f25af65faf36bc3bc4a6537597cc0181f9a2e1458cde387e3
```

This proves the full settlement flow end-to-end on real testnet state: a listing registered on Registry, settled through Payment (fee calculated, TxRecord stored), which cross-contract-calls Reputation to update both the provider's and agent's scores — exactly the sequence the live x402 facilitator will run in production.

## Facilitator API

`POST /verify` — the x402 payment verification endpoint. Provider middleware sends a signed payment payload here; the facilitator validates it (structure, expiry, replay, signature, balance, daily spending limit), then asynchronously settles the CSPR transfer and records it on-chain via the Payment contract's `settle_transaction`.

```bash
curl -X POST http://localhost:3001/verify \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "x402",
    "version": "1",
    "scheme": "casper-cspr",
    "network": "casper-test",
    "payload": {
      "from": "<agent account hash>",
      "from_public_key": "<agent public key hex>",
      "to": "<provider account hash>",
      "amount": "3000000000",
      "listing_id": 1,
      "nonce": "<uuid-v4>",
      "expires_at": 1234567890,
      "facilitator_url": "http://localhost:3001"
    },
    "signature": "<hex signature over the canonicalized payload>"
  }'
```

Returns `{ "valid": true, "receipt": { "tx_hash": "pending", "settled_amount": "...", "facilitator_signature": "...", "timestamp": ... } }` on success, or `{ "valid": false, "error": "<code>" }` with one of: `invalid_payload_structure`, `payment_expired`, `duplicate_nonce`, `public_key_mismatch`, `invalid_signature`, `insufficient_balance`, `daily_limit_exceeded`.

**Known constraint discovered during testing**: Casper enforces a 2.5 CSPR (2,500,000,000 motes) minimum on native transfers, so any listing settled via a plain transfer needs a price-per-call at or above that floor — true sub-cent micropayments would need batching/aggregation, which is out of scope for the hackathon.

**Hackathon simplification**: the facilitator's own wallet executes the real CSPR transfer to the provider (matching signature verification against the agent's signed authorization), rather than the agent's wallet signing its own transfer. Production would have the agent pre-sign and the facilitator merely relay/broadcast it, so the facilitator never holds any wallet's private key but the agent's own.

Run `npm run verify:day6` in `backend/` (with the server running) to exercise all 6 cases end-to-end against live testnet.

## Status

Smart contracts (Registry, Reputation, Payment) are written, tested, deployed, wired, and verified end-to-end on Casper Testnet. The facilitator backend's `/verify` endpoint is live, tested against 6 real cases including a full on-chain settlement. Currently in active development for the Buildathon Qualification Round (deadline June 30, 2026).

## Links

- Demo Video: _TBD_
- Live Dashboard: _TBD_
- DoraHacks Submission: _TBD_
