import { diffLines } from '@/core/diff';

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  onApply: () => void;
  onDiscard: () => void;
  applying: boolean;
}

export function DiffView({ oldContent, newContent, onApply, onDiscard, applying }: DiffViewProps) {
  const lines = diffLines(oldContent, newContent);

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
        <span class="text-sm font-medium text-gray-900">Review Merge</span>
        <div class="flex gap-2">
          <button
            onClick={onDiscard}
            disabled={applying}
            class="text-xs px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={onApply}
            disabled={applying}
            class="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            {applying ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>

      {/* Diff lines */}
      <div class="flex-1 overflow-y-auto p-3 font-mono text-xs">
        {lines.map((line, i) => (
          <div
            key={i}
            class={`px-2 py-0.5 whitespace-pre-wrap ${
              line.type === 'add'
                ? 'bg-green-50 text-green-800'
                : line.type === 'remove'
                ? 'bg-red-50 text-red-800 line-through'
                : 'text-gray-700'
            }`}
          >
            <span class="select-none text-gray-400 mr-2">
              {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
            </span>
            {line.content || '\u00A0'}
          </div>
        ))}
      </div>
    </div>
  );
}
