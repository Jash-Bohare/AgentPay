# AgentPay — Developer & Provider Portal

This directory contains the **Next.js 15 client dashboard** for the AgentPay network. The web app serves both consumers (Agent Developers who manage agent budgets, limits, and whitelists) and producers (Service Providers who list their APIs).

---

## 🎨 Core Layout & Pages

The dashboard is structured into three primary portals:

### 1. Public API Marketplace (`/marketplace`)
* **Dynamic Search & Filters**: Live filter search bar and tabbed navigation to filter by category (**All**, **PriceData**, **Compute**, **Compliance**, **Document**, **Other**).
* **Reputation Badges**: Prominently highlights provider reputation tiers computed from on-chain transactions.
* **Code Snippet Panel**: Expandable drawer containing interactive copy-to-clipboard code blocks (Node.js/TypeScript & Python) with the listing price, target wallet, and listing ID prefilled.

### 2. Developer Dashboard Overview (`/developer`)
* **Stats Counter Panel**: Displays aggregate metrics: Total Managed Balance (CSPR), Active Wallets, and Lifetime transactions.
* **Wallet Management Grid**: Displays agent wallets, current on-chain balances, spending limit status, and daily budget utilization progress bars.
* **On-Chain Faucet**: A **Top Up (50 CSPR)** button to get instant sandbox funds via our facilitator faucet.

### 3. Agent Budget Control Panel (`/developer/agent/[wallet]`)
* **Real-time Tx Feed**: Live log stream of API execution events polling every 5 seconds, displaying parameters, status, and block explorer links.
* **Interactive Controls**:
  * **Daily Limit**: Numeric CSPR text field with instantaneous database sync.
  * **Status Toggle**: One-click Pause/Resume which toggles spending limits.
  * **Category Whitelist**: Multi-select checkbox layout allowing developers to whitelist specific API category permissions.
* **Visual Recharts Graphs**:
  * **Spend History**: Area chart showing daily spend trends.
  * **Category Share**: Pie chart highlighting spend distribution across categories.

---

## 🛠️ Local Development & Setup

### 1. Configure Local Environment
Ensure you have database access configured. Create a `.env.local` file in the `dashboard` directory:

```env
# Supabase PostgreSQL URL
DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"

# AgentPay Facilitator Backend URL
NEXT_PUBLIC_BACKEND_URL="http://localhost:3001"
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the portal.

### 4. Build for Production
Verify typescript compilation and static site generation:
```bash
npm run build
```
This compiles the application, runs syntax checkers, and generates dynamic and static chunks.
