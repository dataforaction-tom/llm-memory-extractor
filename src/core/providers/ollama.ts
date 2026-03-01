import type { LLMProvider, ChatMessage } from '@/types';
import { ProviderError, withRetry } from './index';

export function createOllamaProvider(endpoint = 'http://localhost:11434'): LLMProvider {
  return {
    id: 'ollama',
    name: 'Ollama',

    async chat(messages: ChatMessage[], model: string): Promise<string> {
      return withRetry(async () => {
        const res = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            stream: false,
          }),
        });
        if (!res.ok) {
          throw new ProviderError(`Ollama error: ${res.statusText}`, res.status);
        }
        const data = await res.json();
        return data.message.content;
      });
    },

    async listModels(): Promise<string[]> {
      try {
        const res = await fetch(`${endpoint}/api/tags`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.models || []).map((m: any) => m.name);
      } catch {
        return [];
      }
    },

    async validateKey(): Promise<boolean> {
      try {
        const res = await fetch(`${endpoint}/api/tags`);
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
