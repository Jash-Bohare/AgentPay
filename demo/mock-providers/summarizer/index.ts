/**
 * Mock Provider 3 — Text Summarizer
 *
 * Port: 3012
 * Endpoint: POST /summarize  { text: string, max_sentences?: number }
 * Response: { summary, word_count, sentence_count, original_length, processing_time_ms }
 *
 * Demonstrates that AgentPay works for *compute* services (not just data feeds).
 * Implements a simple extractive summarizer — picks the highest-scoring sentences
 * based on word frequency (TF). No external LLM dependency required; the demo
 * works offline.
 *
 * Protected by agentPayMiddleware.
 */

import 'dotenv/config';
import express from 'express';
import { agentPayMiddleware } from '../../../middleware/src/index.js';

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.SUMMARIZER_PORT ?? 3012);
const LISTING_ID = Number(process.env.SUMMARIZER_LISTING_ID ?? 0);
const PROVIDER_WALLET = process.env.PROVIDER_WALLET ?? '';
const FACILITATOR_URL = process.env.AGENTPAY_BACKEND_URL ?? 'http://localhost:3001';
const PRICE_MOTES = process.env.SUMMARIZER_PRICE_MOTES ?? '1000000000'; // 1 CSPR

// ---------------------------------------------------------------------------
// Simple extractive summarizer (TF-based sentence scoring)
// ---------------------------------------------------------------------------

function summarize(text: string, maxSentences = 3): string {
  // Split into sentences (naive but adequate for demo)
  const sentences = text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length <= maxSentences) return sentences.join(' ');

  // Count word frequencies (stop-word filtered)
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
    'is','are','was','were','be','been','has','have','had','this','that','it',
    'its','they','their','there','these','those','then','than','so','if','as',
  ]);

  const freq: Record<string, number> = {};
  for (const word of text.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []) {
    if (!stopWords.has(word)) freq[word] = (freq[word] ?? 0) + 1;
  }

  // Score each sentence by summing word frequencies
  const scored = sentences.map((sentence) => {
    const words = sentence.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
    const score = words.reduce((sum, w) => sum + (freq[w] ?? 0), 0) / Math.max(words.length, 1);
    return { sentence, score };
  });

  // Pick the top-N by score, then restore original order
  const topSet = new Set(
    scored
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .map((s) => s.sentence)
  );

  return scored
    .filter((s) => topSet.has(s.sentence))
    .map((s) => s.sentence)
    .join(' ');
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    service: 'Text Summarizer',
    listing_id: LISTING_ID,
    price_motes: PRICE_MOTES,
    status: 'ok',
  });
});

// ---------------------------------------------------------------------------
// Paid endpoint — POST /summarize
// ---------------------------------------------------------------------------

const paymentGuard = agentPayMiddleware({
  listing_id: LISTING_ID,
  provider_wallet: PROVIDER_WALLET,
  facilitator_url: FACILITATOR_URL,
  expected_price_motes: PRICE_MOTES,
});

app.post('/summarize', paymentGuard, (req, res) => {
  const start = Date.now();
  const body = req.body as Record<string, unknown>;

  if (typeof body.text !== 'string' || body.text.trim().length === 0) {
    res.status(400).json({ error: 'text field is required and must be a non-empty string' });
    return;
  }

  const text = body.text.trim();
  const maxSentences = typeof body.max_sentences === 'number'
    ? Math.min(Math.max(1, body.max_sentences), 10)
    : 3;

  const summary = summarize(text, maxSentences);
  const words = text.match(/\b\w+\b/g) ?? [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 5);

  res.json({
    summary,
    word_count: words.length,
    sentence_count: sentences.length,
    original_length: text.length,
    summary_length: summary.length,
    processing_time_ms: Date.now() - start,
    model: 'extractive-tf-v1 (AgentPay mock)',
    payment_receipt_tx: req.paymentReceipt?.tx_hash ?? 'pending',
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`✅ Text Summarizer running on port ${PORT}  (listing_id: ${LISTING_ID})`);
});
