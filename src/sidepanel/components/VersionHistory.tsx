import type { DocumentHistoryEntry } from '@/types';

interface VersionHistoryProps {
  history: DocumentHistoryEntry[];
  currentVersion: number;
  onRestore: (index: number) => void;
  onClose: () => void;
}

export function VersionHistory({ history, currentVersion, onRestore, onClose }: VersionHistoryProps) {
  if (history.length === 0) {
    return (
      <div class="p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-gray-900">Version History</span>
          <button onClick={onClose} class="text-xs text-gray-500 hover:text-gray-700">Close</button>
        </div>
        <p class="text-sm text-gray-500">No previous versions.</p>
      </div>
    );
  }

  return (
    <div class="p-4">
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm font-medium text-gray-900">Version History</span>
        <button onClick={onClose} class="text-xs text-gray-500 hover:text-gray-700">Close</button>
      </div>
      <div class="space-y-2">
        <div class="text-xs px-3 py-2 bg-green-50 border border-green-200 rounded">
          v{currentVersion} (current)
        </div>
        {[...history].reverse().map((entry, i) => {
          const actualIndex = history.length - 1 - i;
          return (
            <div key={actualIndex} class="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded">
              <div>
                <span class="text-xs font-medium text-gray-700">v{entry.version}</span>
                <span class="text-xs text-gray-400 ml-2">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
                <span class={`text-xs ml-2 px-1.5 py-0.5 rounded ${
                  entry.source === 'merge' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {entry.source === 'merge' ? 'merge' : 'edit'}
                </span>
              </div>
              <button
                onClick={() => onRestore(actualIndex)}
                class="text-xs text-green-600 hover:text-green-700"
              >
                Restore
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
