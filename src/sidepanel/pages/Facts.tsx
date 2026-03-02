import { useState, useEffect } from 'preact/hooks';
import { getAllFacts, updateFact, deleteFact } from '@/storage/db';
import { FactCard } from '../components/FactCard';
import type { Fact } from '@/types';

export function Facts() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [filter, setFilter] = useState({ status: 'all', category: 'all', search: '' });
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);

  useEffect(() => { loadFacts(); }, []);

  async function loadFacts() {
    const allFacts = await getAllFacts();
    setFacts(allFacts.sort((a, b) => b.createdAt - a.createdAt));
  }

  const filteredFacts = facts.filter(f => {
    if (filter.status !== 'all' && f.status !== filter.status) return false;
    if (filter.category !== 'all' && f.categoryId !== filter.category) return false;
    if (filter.search) {
      const s = filter.search.toLowerCase();
      return f.key.toLowerCase().includes(s) || JSON.stringify(f.value).toLowerCase().includes(s);
    }
    return true;
  });

  const categories = [...new Set(facts.map(f => f.categoryId))].sort();
  const pendingCount = facts.filter(f => f.status === 'pending').length;

  async function handleConfirm(id: string) {
    await updateFact(id, { status: 'confirmed', updatedAt: Date.now() });
    await loadFacts();
    setMergeNotice('Fact confirmed — go to Docs tab to merge');
    setTimeout(() => setMergeNotice(null), 4000);
  }

  async function handleReject(id: string) {
    await updateFact(id, { status: 'rejected', updatedAt: Date.now() });
    await loadFacts();
  }

  async function handleDelete(id: string) {
    await deleteFact(id);
    await loadFacts();
  }

  async function confirmAll() {
    const pending = facts.filter(f => f.status === 'pending');
    for (const f of pending) {
      await updateFact(f.id, { status: 'confirmed', updatedAt: Date.now() });
    }
    await loadFacts();
    setMergeNotice(`${pending.length} facts confirmed — go to Docs tab to merge`);
    setTimeout(() => setMergeNotice(null), 4000);
  }

  return (
    <div class="p-4 space-y-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search facts..."
        value={filter.search}
        onInput={(e) => setFilter({ ...filter, search: (e.target as HTMLInputElement).value })}
        class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {mergeNotice && (
        <div class="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
          {mergeNotice}
        </div>
      )}

      {/* Filter bar */}
      <div class="flex gap-2">
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: (e.target as HTMLSelectElement).value })}
          class="text-xs px-2 py-1 border border-gray-200 rounded"
        >
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filter.category}
          onChange={(e) => setFilter({ ...filter, category: (e.target as HTMLSelectElement).value })}
          class="text-xs px-2 py-1 border border-gray-200 rounded"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Bulk actions */}
      {pendingCount > 0 && (
        <div class="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
          <span class="text-sm text-yellow-700">{pendingCount} pending review</span>
          <button onClick={confirmAll} class="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600">
            Confirm All
          </button>
        </div>
      )}

      {/* Fact list */}
      <div class="space-y-2">
        {filteredFacts.length === 0 ? (
          <p class="text-sm text-gray-500 text-center py-8">No facts found.</p>
        ) : (
          filteredFacts.map(fact => (
            <FactCard key={fact.id} fact={fact} onConfirm={handleConfirm} onReject={handleReject} onDelete={handleDelete} />
          ))
        )}
      </div>
    </div>
  );
}
