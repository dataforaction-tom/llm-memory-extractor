import type { LLMProvider, ChatMessage } from '@/types';
import { ProviderError, withRetry } from './index';

export function createOllamaProvider(endpoint = 'http://localhost:11434'): LLMProvider {
  return {
    id: 'ollama',
    name: 'Ollama',

    async chat(messages: ChatMessage[], model: string): Promise<string> {
      return withRetry(async () => {
        const url = `${endpoint}/api/chat`;
        console.log(`[Ollama] POST ${url} model=${model} messages=${messages.length}`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            stream: false,
          }),
          signal: AbortSignal.timeout(120000), // 2 minute timeout
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.error(`[Ollama] ${res.status} ${res.statusText}`, body);
          throw new ProviderError(
            `Ollama error: ${res.status} ${res.statusText}${body ? ' — ' + body.substring(0, 200) : ''}`,
            res.status,
          );
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
        // First check if Ollama is reachable
        const tagsRes = await fetch(`${endpoint}/api/tags`);
        if (!tagsRes.ok) return false;
        const tagsData = await tagsRes.json();
        const models = (tagsData.models || []).map((m: any) => m.name);
        if (models.length === 0) return false;

        // Actually test a POST request (same as extraction uses)
        const testRes = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: models[0],
            messages: [{ role: 'user', content: 'Say "ok"' }],
            stream: false,
          }),
        });
        console.log(`[Ollama] Validate POST: ${testRes.status} ${testRes.statusText}`);
        if (!testRes.ok) {
          const body = await testRes.text().catch(() => '');
          console.error(`[Ollama] Validate failed:`, body);
        }
        return testRes.ok;
      } catch (err) {
        console.error('[Ollama] Validate error:', err);
        return false;
      }
    },
  };
}
