import type { Fact } from '@/types';

interface FactCardProps {
  fact: Fact;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
}

export function FactCard({ fact, onConfirm, onReject, onDelete }: FactCardProps) {
  const valueText = (fact.value.text as string)
    || (fact.value.items as string[] | undefined)?.join(', ')
    || Object.entries(fact.value).map(([k, v]) => `${k}: ${v}`).join(', ');

  const confidenceColor = fact.confidence >= 0.8 ? 'bg-green-500'
    : fact.confidence >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div class="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
      {/* Header: category + status */}
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
          {fact.categoryId}
        </span>
        <div class="flex items-center gap-1">
          {fact.piiWarning && (
            <span class="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">PII</span>
          )}
          <span class={`text-xs px-1.5 py-0.5 rounded ${
            fact.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
            : fact.status === 'confirmed' ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
          }`}>
            {fact.status}
          </span>
        </div>
      </div>

      {/* Key + value */}
      <div>
        <p class="text-sm font-medium text-gray-900">{fact.key.replace(/_/g, ' ')}</p>
        <p class="text-sm text-gray-600">{valueText}</p>
      </div>

      {/* Confidence bar */}
      <div class="flex items-center gap-2">
        <div class="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div class={`h-full ${confidenceColor} rounded-full`} style={{ width: `${fact.confidence * 100}%` }} />
        </div>
        <span class="text-xs text-gray-400">{(fact.confidence * 100).toFixed(0)}%</span>
      </div>

      {/* Evidence quote */}
      {fact.evidenceQuote && (
        <p class="text-xs text-gray-400 italic truncate">"{fact.evidenceQuote}"</p>
      )}

      {/* Actions (only for pending) */}
      {fact.status === 'pending' && (
        <div class="flex gap-2 pt-1">
          <button onClick={() => onConfirm(fact.id)} class="flex-1 text-xs py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">
            Confirm
          </button>
          <button onClick={() => onReject(fact.id)} class="flex-1 text-xs py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">
            Reject
          </button>
          <button onClick={() => onDelete(fact.id)} class="text-xs py-1 px-2 text-gray-400 rounded hover:bg-gray-100">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
