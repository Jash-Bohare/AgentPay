import './env.js';
import express from 'express';
import agentRouter from './routes/agent.js';
import listingsRouter from './routes/listings.js';
import providerRouter from './routes/provider.js';
import verifyRouter from './routes/verify.js';
import { startSyncLoops } from './services/sync.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agentpay-backend' });
});

app.use(verifyRouter);
app.use(agentRouter);
app.use(listingsRouter);
app.use(providerRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`AgentPay backend listening on port ${port}`);
  startSyncLoops();
});
