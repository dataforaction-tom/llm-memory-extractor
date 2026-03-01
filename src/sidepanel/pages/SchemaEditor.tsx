import { useState, useEffect, useCallback } from 'preact/hooks';
import { loadSchema, saveSchema, resetSchema, getDefaultSchema } from '@/core/schema';
import { CategoryEditor } from '../components/CategoryEditor';
import type { ExtractionSchema, Category, PIIRule } from '@/types';
import { v4 as uuid } from 'uuid';

export function SchemaEditor() {
  const [schema, setSchema] = useState<ExtractionSchema | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');

  useEffect(() => {
    loadSchema().then(s => setSchema(s));
  }, []);

  // Auto-save with debounce
  const debouncedSave = useCallback(
    debounce(async (s: ExtractionSchema) => {
      await saveSchema(s);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    }, 1000),
    []
  );

  function updateSchema(updated: ExtractionSchema) {
    setSchema(updated);
    debouncedSave(updated);
  }

  function updateCategory(updated: Category) {
    if (!schema) return;
    updateSchema({
      ...schema,
      categories: schema.categories.map(c => c.id === updated.id ? updated : c),
    });
  }

  function deleteCategory(id: string) {
    if (!schema) return;
    updateSchema({ ...schema, categories: schema.categories.filter(c => c.id !== id) });
  }

  function addCategory() {
    if (!schema) return;
    const newCat: Category = {
      id: `custom_${Date.now()}`,
      name: 'New Category',
      description: '',
      extractionHints: [],
      examples: [],
      enabled: true,
    };
    updateSchema({ ...schema, categories: [...schema.categories, newCat] });
  }

  // Global rules
  function updateGlobalRule(index: number, value: string) {
    if (!schema) return;
    const rules = [...schema.globalRules];
    rules[index] = value;
    updateSchema({ ...schema, globalRules: rules });
  }
  function addGlobalRule() {
    if (!schema) return;
    updateSchema({ ...schema, globalRules: [...schema.globalRules, ''] });
  }
  function removeGlobalRule(i: number) {
    if (!schema) return;
    updateSchema({ ...schema, globalRules: schema.globalRules.filter((_, idx) => idx !== i) });
  }

  // PII rules
  function updatePIIRule(index: number, updated: PIIRule) {
    if (!schema) return;
    const rules = [...schema.piiRules];
    rules[index] = updated;
    updateSchema({ ...schema, piiRules: rules });
  }
  function addPIIRule() {
    if (!schema) return;
    const rule: PIIRule = { id: uuid(), type: 'keyword', pattern: '', description: '', enabled: true };
    updateSchema({ ...schema, piiRules: [...schema.piiRules, rule] });
  }
  function removePIIRule(i: number) {
    if (!schema) return;
    updateSchema({ ...schema, piiRules: schema.piiRules.filter((_, idx) => idx !== i) });
  }

  // Import/export
  function exportSchema() {
    if (!schema) return;
    const json = JSON.stringify(schema, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'extraction-schema.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function importSchema() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const imported = JSON.parse(text) as ExtractionSchema;
        updateSchema(imported);
      } catch { alert('Invalid schema file'); }
    };
    input.click();
  }

  async function handleReset() {
    if (confirm('Reset schema to defaults? This cannot be undone.')) {
      await resetSchema();
      const fresh = await loadSchema();
      setSchema(fresh);
    }
  }

  if (!schema) return <div class="p-4">Loading...</div>;

  return (
    <div class="p-4 space-y-6">
      {/* Save indicator */}
      {saveStatus && <div class="text-xs text-green-600 text-center">{saveStatus}</div>}

      {/* Categories */}
      <div>
        <h3 class="font-medium text-gray-900 mb-3">Categories</h3>
        <div class="space-y-2">
          {schema.categories.map(cat => (
            <CategoryEditor key={cat.id} category={cat} onChange={updateCategory} onDelete={deleteCategory} />
          ))}
        </div>
        <button onClick={addCategory} class="mt-2 text-sm text-green-600 hover:text-green-700">+ Add Category</button>
      </div>

      {/* Global rules */}
      <div>
        <h3 class="font-medium text-gray-900 mb-3">Global Rules</h3>
        {schema.globalRules.map((rule, i) => (
          <div key={i} class="flex gap-1 mb-1">
            <input type="text" value={rule} onInput={(e) => updateGlobalRule(i, (e.target as HTMLInputElement).value)}
              class="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500" />
            <button onClick={() => removeGlobalRule(i)} class="text-xs text-red-400 px-1">✕</button>
          </div>
        ))}
        <button onClick={addGlobalRule} class="text-xs text-green-600">+ Add rule</button>
      </div>

      {/* PII rules */}
      <div>
        <h3 class="font-medium text-gray-900 mb-3">PII Rules</h3>
        {schema.piiRules.map((rule, i) => (
          <div key={rule.id} class="flex gap-1 mb-1 items-center">
            <select value={rule.type} onChange={(e) => updatePIIRule(i, { ...rule, type: (e.target as HTMLSelectElement).value as 'keyword' | 'regex' })}
              class="text-xs border border-gray-200 rounded px-1 py-1">
              <option value="keyword">Keyword</option>
              <option value="regex">Regex</option>
            </select>
            <input type="text" value={rule.pattern} placeholder="Pattern"
              onInput={(e) => updatePIIRule(i, { ...rule, pattern: (e.target as HTMLInputElement).value })}
              class="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500" />
            <label class="flex items-center">
              <input type="checkbox" checked={rule.enabled}
                onChange={() => updatePIIRule(i, { ...rule, enabled: !rule.enabled })} />
            </label>
            <button onClick={() => removePIIRule(i)} class="text-xs text-red-400 px-1">✕</button>
          </div>
        ))}
        <button onClick={addPIIRule} class="text-xs text-green-600">+ Add PII rule</button>
      </div>

      {/* Footer actions */}
      <div class="flex gap-2 flex-wrap">
        <button onClick={exportSchema} class="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50">Export Schema</button>
        <button onClick={importSchema} class="text-xs px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50">Import Schema</button>
        <button onClick={handleReset} class="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50">Reset to Defaults</button>
      </div>
    </div>
  );
}

// Simple debounce utility
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
