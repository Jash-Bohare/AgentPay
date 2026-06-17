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
- Reputation: _TBD_
- Payment: _TBD_

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

The Registry contract is live on Casper Testnet. Query it directly:

```bash
cd contracts/registry
ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network \
ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test \
ODRA_CASPER_LIVENET_EVENTS_URL=https://node.testnet.casper.network/events \
ODRA_CASPER_LIVENET_SECRET_KEY_PATH=../../keys/deployer_secret_key.pem \
cargo run --bin registry_cli -- contract Registry get_listing --listing_id 0
```

Returns the on-chain `CSPR/USD Price Feed` listing registered during development, proving the write (`register_listing`) and read (`get_listing`) paths both work against real testnet state.

## Status

Currently in active development for the Buildathon Qualification Round (deadline June 30, 2026).

## Links

- Demo Video: _TBD_
- Live Dashboard: _TBD_
- DoraHacks Submission: _TBD_
