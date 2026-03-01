import { useState, useEffect } from 'preact/hooks';
import type { ProviderConfig as ProviderConfigType, ProviderType } from '@/types';

const PROVIDERS: Array<{ type: ProviderType; name: string }> = [
  { type: 'ollama', name: 'Ollama (Local)' },
  { type: 'anthropic', name: 'Anthropic' },
  { type: 'openai', name: 'OpenAI' },
  { type: 'mistral', name: 'Mistral' },
  { type: 'google', name: 'Google (Gemini)' },
  { type: 'greenpt', name: 'GreenPT' },
];

interface Props {
  config: ProviderConfigType;
  onChange: (config: ProviderConfigType) => void;
}

// Store API keys per provider so switching doesn't lose them
const API_KEYS_STORAGE_KEY = 'providerApiKeys';

async function loadSavedKeys(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(API_KEYS_STORAGE_KEY);
  return result[API_KEYS_STORAGE_KEY] || {};
}

async function saveKeyForProvider(providerType: string, apiKey: string) {
  const keys = await loadSavedKeys();
  keys[providerType] = apiKey;
  await chrome.storage.local.set({ [API_KEYS_STORAGE_KEY]: keys });
}

export function ProviderConfig({ config, onChange }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    // Load models when config changes
    loadModels();
  }, [config.type, config.apiKey, config.endpoint]);

  async function loadModels() {
    try {
      const { createProvider } = await import('@/core/providers/index');
      const provider = createProvider(config);
      const m = await provider.listModels();
      setModels(m);
    } catch {
      setModels([]);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const { createProvider } = await import('@/core/providers/index');
      const provider = createProvider(config);
      const valid = await provider.validateKey();
      setTestResult(valid ? 'success' : 'failed');
    } catch {
      setTestResult('failed');
    }
    setTesting(false);
  }

  const needsApiKey = config.type !== 'ollama';

  return (
    <div class="space-y-3">
      {/* Provider selection */}
      <div>
        <label class="text-xs text-gray-500 block mb-1">LLM Provider</label>
        <select
          value={config.type}
          onChange={async (e) => {
            // Save current key before switching
            if (config.apiKey) {
              await saveKeyForProvider(config.type, config.apiKey);
            }
            const newType = (e.target as HTMLSelectElement).value as ProviderType;
            // Restore saved key for new provider
            const savedKeys = await loadSavedKeys();
            onChange({ ...config, type: newType, apiKey: savedKeys[newType] || '', model: '' });
          }}
          class="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {PROVIDERS.map(p => <option key={p.type} value={p.type}>{p.name}</option>)}
        </select>
      </div>

      {/* Endpoint (Ollama + GreenPT) */}
      {(config.type === 'ollama' || config.type === 'greenpt') && (
        <div>
          <label class="text-xs text-gray-500 block mb-1">Endpoint URL</label>
          <input
            type="text"
            value={config.endpoint || (config.type === 'ollama' ? 'http://localhost:11434' : 'https://api.greenpt.ai/v1')}
            onInput={(e) => onChange({ ...config, endpoint: (e.target as HTMLInputElement).value })}
            class="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      )}

      {/* API Key */}
      {needsApiKey && (
        <div>
          <label class="text-xs text-gray-500 block mb-1">API Key</label>
          <div class="flex gap-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={config.apiKey || ''}
              onInput={(e) => {
                const newKey = (e.target as HTMLInputElement).value;
                saveKeyForProvider(config.type, newKey);
                onChange({ ...config, apiKey: newKey });
              }}
              placeholder="sk-..."
              class="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <button onClick={() => setShowKey(!showKey)} class="text-xs px-2 border border-gray-200 rounded hover:bg-gray-50">
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      )}

      {/* Model selection */}
      <div>
        <label class="text-xs text-gray-500 block mb-1">Model</label>
        {models.length > 0 ? (
          <select
            value={config.model || ''}
            onChange={(e) => onChange({ ...config, model: (e.target as HTMLSelectElement).value })}
            class="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            <option value="">Select a model</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={config.model || ''}
            onInput={(e) => onChange({ ...config, model: (e.target as HTMLInputElement).value })}
            placeholder="e.g., llama3"
            class="w-full text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        )}
      </div>

      {/* Test connection */}
      <div class="flex items-center gap-2">
        <button
          onClick={testConnection}
          disabled={testing}
          class="text-xs px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        {testResult === 'success' && <span class="text-xs text-green-600">Connected!</span>}
        {testResult === 'failed' && <span class="text-xs text-red-600">Connection failed</span>}
      </div>
    </div>
  );
}
