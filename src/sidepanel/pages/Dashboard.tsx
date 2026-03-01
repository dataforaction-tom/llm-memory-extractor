import { useState, useEffect } from 'preact/hooks';
import { getAllFacts } from '@/storage/db';
import type { Fact } from '@/types';

interface Stats {
  totalFacts: number;
  pendingFacts: number;
  confirmedFacts: number;
  totalConversations: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalFacts: 0,
    pendingFacts: 0,
    confirmedFacts: 0,
    totalConversations: 0,
  });
  const [recentFacts, setRecentFacts] = useState<Fact[]>([]);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    loadStats();
    loadRecentFacts();
  }, []);

  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      if (response) setStats(response);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function loadRecentFacts() {
    try {
      const facts = await getAllFacts();
      // Sort by createdAt descending, take 10
      const recent = facts.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      setRecentFacts(recent);
    } catch (err) {
      console.error('Failed to load recent facts:', err);
    }
  }

  async function toggleCapture() {
    // Toggle capture on the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_CAPTURE_STATE',
          recording: !capturing,
        });
        setCapturing(!capturing);
      } catch {
        // Tab might not have content script
      }
    }
  }

  return (
    <div class="p-4 space-y-6">
      {/* Capture toggle */}
      <div class="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <h3 class="font-medium text-gray-900">Memory Capture</h3>
          <p class="text-sm text-gray-500">
            {capturing ? 'Recording conversations...' : 'Capture is off'}
          </p>
        </div>
        <button
          onClick={toggleCapture}
          class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            capturing ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            class={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              capturing ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Stats cards */}
      <div class="grid grid-cols-3 gap-3">
        <StatCard label="Total Facts" value={stats.totalFacts} color="blue" />
        <StatCard label="Pending" value={stats.pendingFacts} color="yellow" />
        <StatCard label="Conversations" value={stats.totalConversations} color="green" />
      </div>

      {/* Recent activity */}
      <div>
        <h3 class="font-medium text-gray-900 mb-3">Recent Activity</h3>
        {recentFacts.length === 0 ? (
          <p class="text-sm text-gray-500">
            No facts extracted yet. Start a conversation and toggle capture on.
          </p>
        ) : (
          <div class="space-y-2">
            {recentFacts.map((fact) => (
              <div key={fact.id} class="bg-white rounded-lg border border-gray-200 p-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    {fact.categoryId}
                  </span>
                  <span class="text-xs text-gray-400">
                    {new Date(fact.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p class="text-sm font-medium text-gray-900">{fact.key.replace(/_/g, ' ')}</p>
                <p class="text-xs text-gray-600 truncate">
                  {typeof fact.value === 'object'
                    ? ((fact.value as Record<string, unknown>).text as string) ||
                      JSON.stringify(fact.value)
                    : String(fact.value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'border-blue-500 text-blue-600',
    yellow: 'border-yellow-500 text-yellow-600',
    green: 'border-green-500 text-green-600',
  };
  return (
    <div class={`bg-white rounded-lg border border-gray-200 border-t-2 ${colors[color]} p-3`}>
      <p class="text-2xl font-bold">{value}</p>
      <p class="text-xs text-gray-500">{label}</p>
    </div>
  );
}
