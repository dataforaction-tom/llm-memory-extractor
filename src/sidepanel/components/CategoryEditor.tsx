import { useState } from 'preact/hooks';
import type { Category } from '@/types';

interface CategoryEditorProps {
  category: Category;
  onChange: (updated: Category) => void;
  onDelete: (id: string) => void;
}

export function CategoryEditor({ category, onChange, onDelete }: CategoryEditorProps) {
  const [expanded, setExpanded] = useState(false);

  function updateField<K extends keyof Category>(field: K, value: Category[K]) {
    onChange({ ...category, [field]: value });
  }

  function updateHint(index: number, value: string) {
    const hints = [...category.extractionHints];
    hints[index] = value;
    updateField('extractionHints', hints);
  }

  function addHint() { updateField('extractionHints', [...category.extractionHints, '']); }
  function removeHint(i: number) { updateField('extractionHints', category.extractionHints.filter((_, idx) => idx !== i)); }

  function updateExample(index: number, value: string) {
    const examples = [...category.examples];
    examples[index] = value;
    updateField('examples', examples);
  }

  function addExample() { updateField('examples', [...category.examples, '']); }
  function removeExample(i: number) { updateField('examples', category.examples.filter((_, idx) => idx !== i)); }

  return (
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header - always visible */}
      <div class="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <span class="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
        <input
          type="text"
          value={category.name}
          onInput={(e) => updateField('name', (e.target as HTMLInputElement).value)}
          onClick={(e) => e.stopPropagation()}
          class="flex-1 text-sm font-medium bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-green-500 rounded px-1"
        />
        <label class="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={category.enabled}
            onChange={() => updateField('enabled', !category.enabled)}
            class="rounded text-green-500"
          />
          <span class="text-xs text-gray-500">Enabled</span>
        </label>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div class="px-3 pb-3 space-y-3 border-t border-gray-100">
          {/* Description */}
          <div>
            <label class="text-xs text-gray-500 block mb-1">Description</label>
            <textarea
              value={category.description}
              onInput={(e) => updateField('description', (e.target as HTMLTextAreaElement).value)}
              class="w-full text-sm border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-green-500"
              rows={2}
            />
          </div>

          {/* Extraction hints */}
          <div>
            <label class="text-xs text-gray-500 block mb-1">Extraction Hints</label>
            {category.extractionHints.map((hint, i) => (
              <div key={i} class="flex gap-1 mb-1">
                <input
                  type="text" value={hint}
                  onInput={(e) => updateHint(i, (e.target as HTMLInputElement).value)}
                  class="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button onClick={() => removeHint(i)} class="text-xs text-red-400 px-1 hover:text-red-600">✕</button>
              </div>
            ))}
            <button onClick={addHint} class="text-xs text-green-600 hover:text-green-700">+ Add hint</button>
          </div>

          {/* Example facts */}
          <div>
            <label class="text-xs text-gray-500 block mb-1">Example Facts</label>
            {category.examples.map((ex, i) => (
              <div key={i} class="flex gap-1 mb-1">
                <input
                  type="text" value={ex}
                  onInput={(e) => updateExample(i, (e.target as HTMLInputElement).value)}
                  class="flex-1 text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <button onClick={() => removeExample(i)} class="text-xs text-red-400 px-1 hover:text-red-600">✕</button>
              </div>
            ))}
            <button onClick={addExample} class="text-xs text-green-600 hover:text-green-700">+ Add example</button>
          </div>

          {/* Delete */}
          <button onClick={() => onDelete(category.id)} class="text-xs text-red-500 hover:text-red-700">
            Delete category
          </button>
        </div>
      )}
    </div>
  );
}
