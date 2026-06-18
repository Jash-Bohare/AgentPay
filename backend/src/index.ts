import './env.js';
import express from 'express';
import verifyRouter from './routes/verify.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agentpay-backend' });
});

app.use(verifyRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`AgentPay backend listening on port ${port}`);
});
