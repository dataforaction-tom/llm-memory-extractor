import { useState, useEffect } from 'preact/hooks';
import { ProviderConfig } from '../components/ProviderConfig';
import { exportAsJSON, importFromJSON, downloadFile } from '@/storage/export';
import { factsToMarkdown } from '@/core/markdown';
import { getAllFacts, clearAllFacts, clearAllConversations, getDocument } from '@/storage/db';
import { loadSchema, resetSchema } from '@/core/schema';
import { hasFileSystemAccess, pickSyncFolder, verifyPermission, syncAllDocuments } from '@/storage/filesystem';
import { generateAboutMe, ABOUTME_ID } from '@/core/aboutme';
import type { ProviderConfig as ProviderConfigType } from '@/types';

export function Settings() {
  const [config, setConfig] = useState<ProviderConfigType>({ type: 'ollama' });
  const [syncFolder, setSyncFolder] = useState<string | null>(null);
  const [aboutMeStatus, setAboutMeStatus] = useState<string | null>(null);
  const [generatingAboutMe, setGeneratingAboutMe] = useState(false);
  const [aboutMeError, setAboutMeError] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_PROVIDER_CONFIG' }).then((c: any) => {
      if (c) setConfig(c);
    });
    if (hasFileSystemAccess()) {
      verifyPermission().then((handle) => {
        if (handle) setSyncFolder(handle.name);
      });
    }
  }, []);

  useEffect(() => {
    getDocument(ABOUTME_ID).then((doc) => {
      if (doc) {
        setAboutMeStatus(`Last generated ${new Date(doc.updatedAt).toLocaleString()} (v${doc.version})`);
      }
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

  async function handleGenerateAboutMe() {
    setGeneratingAboutMe(true);
    setAboutMeError('');
    try {
      const doc = await generateAboutMe();
      if (doc) {
        setAboutMeStatus(`Last generated ${new Date(doc.updatedAt).toLocaleString()} (v${doc.version})`);
      } else {
        setAboutMeError('No documents with content to summarise yet.');
      }
    } catch (e) {
      setAboutMeError((e as Error).message);
    }
    setGeneratingAboutMe(false);
  }

  return (
    <div class="p-4 space-y-6">
      {/* Provider config */}
      <section>
        <h3 class="text-sm font-serif text-ink mb-3">LLM Provider</h3>
        <ProviderConfig config={config} onChange={handleConfigChange} />
      </section>

      {/* Sync Folder (Chromium only) */}
      {hasFileSystemAccess() && (
        <section>
          <h3 class="text-sm font-serif text-ink mb-3">Sync Folder</h3>
          <div class="flex gap-2">
            <button
              onClick={async () => {
                const handle = await pickSyncFolder();
                if (handle) setSyncFolder(handle.name);
              }}
              class="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-ivory transition-colors text-ink-secondary"
            >
              {syncFolder ? `Folder: ${syncFolder}` : 'Choose Sync Folder'}
            </button>
            {syncFolder && (
              <button
                onClick={async () => {
                  const count = await syncAllDocuments();
                  alert(`Synced ${count} documents.`);
                }}
                class="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-ivory transition-colors text-ink-secondary"
              >
                Sync All Now
              </button>
            )}
          </div>
        </section>
      )}

      {/* About Me Profile */}
      <section>
        <h3 class="text-sm font-serif text-ink mb-1">About Me Profile</h3>
        <p class="text-[11px] text-ink-muted mb-3">
          Generate a unified profile document from all your memory documents.
        </p>
        {aboutMeStatus && (
          <p class="text-[11px] text-ink-muted mb-2">{aboutMeStatus}</p>
        )}
        <button
          onClick={handleGenerateAboutMe}
          disabled={generatingAboutMe}
          class="text-xs px-3 py-1.5 border border-accent/40 rounded-md hover:bg-accent/5 transition-colors text-accent disabled:opacity-50"
        >
          {generatingAboutMe ? 'Generating...' : aboutMeStatus ? 'Regenerate About Me' : 'Generate About Me'}
        </button>
        {aboutMeError && (
          <p class="text-[11px] text-rose mt-2">{aboutMeError}</p>
        )}
      </section>

      {/* Export */}
      <section>
        <h3 class="text-sm font-serif text-ink mb-3">Export</h3>
        <div class="flex gap-2">
          <button onClick={handleExportMarkdown} class="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-ivory transition-colors text-ink-secondary">
            Export Markdown
          </button>
          <button onClick={handleExportJSON} class="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-ivory transition-colors text-ink-secondary">
            Export JSON
          </button>
        </div>
      </section>

      {/* Import */}
      <section>
        <h3 class="text-sm font-serif text-ink mb-3">Import</h3>
        <button onClick={handleImportJSON} class="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-ivory transition-colors text-ink-secondary">
          Import JSON Backup
        </button>
      </section>

      {/* Danger zone */}
      <section>
        <h3 class="text-sm font-serif text-rose mb-3">Danger Zone</h3>
        <div class="border border-rose-light rounded-md divide-y divide-rose-light">
          <button onClick={handleClearFacts} class="block w-full text-left text-xs px-3 py-2.5 text-rose hover:bg-rose-faint transition-colors">
            Clear All Facts
          </button>
          <button onClick={handleClearConversations} class="block w-full text-left text-xs px-3 py-2.5 text-rose hover:bg-rose-faint transition-colors">
            Clear All Conversations
          </button>
          <button onClick={handleResetAll} class="block w-full text-left text-xs px-3 py-2.5 text-rose font-medium bg-rose-faint hover:bg-rose-light transition-colors rounded-b-md">
            Reset Everything
          </button>
        </div>
      </section>
    </div>
  );
}
