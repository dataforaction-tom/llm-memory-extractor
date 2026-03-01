import type { LLMProvider, ProviderConfig } from '@/types';

export class ProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ProviderError';
  }
}

// Retry wrapper: 3 attempts, exponential backoff on 429/500/503
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = err instanceof ProviderError ? err.status : undefined;
      const retryable = status !== undefined && [429, 500, 503].includes(status);
      if (attempt === maxAttempts || !retryable) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error('Unreachable');
}

// Factory - will be filled in as providers are added
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'ollama':
      // TODO: import and create ollama provider
      throw new Error(`Provider not yet implemented: ${config.type}`);
    case 'anthropic':
    case 'openai':
    case 'mistral':
    case 'google':
    case 'greenpt':
      throw new Error(`Provider not yet implemented: ${config.type}`);
    default:
      throw new Error(`Unknown provider: ${config.type}`);
  }
}
