import { loadPrivateKey } from './services/casper.js';

export const facilitatorPrivateKey = loadPrivateKey(process.env.FACILITATOR_PRIVATE_KEY_PATH!);
export const providerPrivateKey = loadPrivateKey(process.env.PROVIDER_PRIVATE_KEY_PATH!);
