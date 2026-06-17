import type { Request, Response, NextFunction } from 'express';

export interface AgentPayMiddlewareConfig {
  listing_id: number;
  provider_wallet: string;
  facilitator_url: string;
  expected_price_motes: string;
}

export function agentPayMiddleware(config: AgentPayMiddlewareConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      return res.status(402).json({
        error: 'payment_required',
        listing_id: config.listing_id,
        price_motes: config.expected_price_motes,
        facilitator_url: config.facilitator_url,
      });
    }

    // TODO (Phase 4): forward payload to facilitator /verify and attach receipt
    next();
  };
}
