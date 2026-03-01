import { useState, useEffect } from 'preact/hooks';
import { ProviderConfig } from '../components/ProviderConfig';
import { exportAsJSON, importFromJSON, downloadFile } from '@/storage/export';
import { factsToMarkdown } from '@/core/markdown';
import { getAllFacts, clearAllFacts, clearAllConversations } from '@/storage/db';
import { loadSchema, resetSchema } from '@/core/schema';
import type { ProviderConfig as ProviderConfigType } from '@/types';

export function Settings() {
  const [config, setConfig] = useState<ProviderConfigType>({ type: 'ollama' });

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_PROVIDER_CONFIG' }).then((c: any) => {
      if (c) setConfig(c);
    });
  }, []);

  async function handleConfigChange(newConfig: ProviderConfigType) {
    setConfig(newConfig);
    await chrome.runtime.sendMessage({ type: 'SAVE_PROVIDER_CONFIG', config: newConfig });
  }

  async function handleExportMarkdown() {
    const facts = await getAllFacts();
    const confirmed = facts.filter(f => f.status === 'confirmed');
    const schema = await loadSchema();
    const markdowns = factsToMarkdown(confirmed, schema.categories);
    for (const [categoryId, md] of Object.entries(markdowns)) {
      downloadFile(md, `${categoryId}.md`, 'text/markdown');
    }
  }

  async function handleExportJSON() {
    const json = await exportAsJSON();
    downloadFile(json, 'llm-memory-backup.json', 'application/json');
  }

  async function handleImportJSON() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        await importFromJSON(text);
        alert('Import successful!');
      } catch (e) {
        alert('Import failed: ' + (e as Error).message);
      }
    };
    input.click();
  }

  async function handleClearFacts() {
    if (confirm('Delete all facts? This cannot be undone.')) {
      await clearAllFacts();
      alert('All facts cleared.');
    }
  }

  async function handleClearConversations() {
    if (confirm('Delete all captured conversations? This cannot be undone.')) {
      await clearAllConversations();
      alert('All conversations cleared.');
    }
  }

  async function handleResetAll() {
    if (confirm('Reset EVERYTHING? All facts, conversations, and schema will be deleted.')) {
      await clearAllFacts();
      await clearAllConversations();
      await resetSchema();
      alert('Everything has been reset.');
    }
  }

  return (
    <div class="p-4 space-y-6">
      {/* Provider config */}
      <div>
        <h3 class="font-medium text-gray-900 mb-3">LLM Provider</h3>
        <div class="bg-white rounded-lg border border-gray-200 p-3">
          <ProviderConfig config={config} onChange={handleConfigChange} />
        </div>
      </div>

      {/* Export */}
      <div>
        <h3 class="font-medium text-gray-900 mb-3">Export</h3>
        <div class="flex gap-2">
          <button onClick={handleExportMarkdown} class="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50">
            Export as Markdown
          </button>
          <button onClick={handleExportJSON} class="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50">
            Export as JSON
          </button>
        </div>
      </div>

      {/* Import */}
      <div>
        <h3 class="font-medium text-gray-900 mb-3">Import</h3>
        <button onClick={handleImportJSON} class="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50">
          Import JSON Backup
        </button>
      </div>

      {/* Danger zone */}
      <div>
        <h3 class="font-medium text-red-600 mb-3">Danger Zone</h3>
        <div class="border border-red-200 rounded-lg p-3 space-y-2">
          <button onClick={handleClearFacts} class="block w-full text-left text-xs px-3 py-2 text-red-600 rounded hover:bg-red-50">
            Clear All Facts
          </button>
          <button onClick={handleClearConversations} class="block w-full text-left text-xs px-3 py-2 text-red-600 rounded hover:bg-red-50">
            Clear All Conversations
          </button>
          <button onClick={handleResetAll} class="block w-full text-left text-xs px-3 py-2 bg-red-50 text-red-700 font-medium rounded hover:bg-red-100">
            Reset Everything
          </button>
        </div>
      </div>
    </div>
  );
}
