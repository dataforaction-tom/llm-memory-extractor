import type { LLMProvider, ChatMessage } from '@/types';
import { ProviderError, withRetry } from './index';

export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    id: 'openai',
    name: 'OpenAI',

    async chat(messages: ChatMessage[], model: string): Promise<string> {
      return withRetry(async () => {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: 4096,
          }),
        });

        if (!res.ok) {
          throw new ProviderError(await res.text(), res.status);
        }

        const data = await res.json();
        return data.choices[0].message.content;
      });
    },

    async listModels(): Promise<string[]> {
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.data || [])
          .map((m: any) => m.id as string)
          .filter((id: string) => id.includes('gpt'));
      } catch {
        return [];
      }
    },

    async validateKey(): Promise<boolean> {
      try {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
