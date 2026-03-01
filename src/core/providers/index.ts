import type { LLMProvider, ProviderConfig } from '@/types';
import { createAnthropicProvider } from './anthropic';
import { createOllamaProvider } from './ollama';
import { createOpenAIProvider } from './openai';
import { createMistralProvider } from './mistral';
import { createGoogleProvider } from './google';
import { createGreenPTProvider } from './greenpt';

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

// Factory
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'ollama':
      return createOllamaProvider(config.endpoint);
    case 'anthropic':
      return createAnthropicProvider(config.apiKey!);
    case 'openai':
      return createOpenAIProvider(config.apiKey!);
    case 'mistral':
      return createMistralProvider(config.apiKey!);
    case 'google':
      return createGoogleProvider(config.apiKey!);
    case 'greenpt':
      return createGreenPTProvider(config.apiKey!, config.endpoint);
    default:
      throw new Error(`Unknown provider: ${config.type}`);
  }
}
