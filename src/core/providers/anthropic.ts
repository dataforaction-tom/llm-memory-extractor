import type { LLMProvider, ChatMessage } from '@/types';
import { ProviderError, withRetry } from './index';

export function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    id: 'anthropic',
    name: 'Anthropic',

    async chat(messages: ChatMessage[], model: string): Promise<string> {
      return withRetry(async () => {
        const systemMsg = messages.find(m => m.role === 'system');
        const chatMsgs = messages.filter(m => m.role !== 'system');

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            ...(systemMsg ? { system: systemMsg.content } : {}),
            messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
          }),
        });

        if (!res.ok) {
          throw new ProviderError(await res.text(), res.status);
        }

        const data = await res.json();
        return data.content[0].text;
      });
    },

    async listModels(): Promise<string[]> {
      return ['claude-sonnet-4-6-20260320', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514'];
    },

    async validateKey(): Promise<boolean> {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
