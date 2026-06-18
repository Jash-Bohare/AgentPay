import './env.js';
import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agentpay-backend' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`AgentPay backend listening on port ${port}`);
});
