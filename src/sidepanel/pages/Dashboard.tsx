import { useState, useEffect, useRef } from 'preact/hooks';
import { getAllFacts } from '@/storage/db';
import type { Fact } from '@/types';

interface Stats {
  totalFacts: number;
  pendingFacts: number;
  confirmedFacts: number;
  totalConversations: number;
}

interface LogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
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
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const lastLogId = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStats();
    loadRecentFacts();
    // Poll activity log every 2 seconds
    pollLog();
    const interval = setInterval(pollLog, 2000);
    return () => clearInterval(interval);
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

  async function pollLog() {
    try {
      const entries = await chrome.runtime.sendMessage({
        type: 'GET_ACTIVITY_LOG',
        sinceId: lastLogId.current,
      });
      if (Array.isArray(entries) && entries.length > 0) {
        lastLogId.current = entries[entries.length - 1].id;
        setLogEntries(prev => [...prev, ...entries].slice(-100));
        // Also refresh stats when new log entries arrive
        loadStats();
        loadRecentFacts();
        // Auto-scroll
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    } catch {
      // Service worker might not be ready
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
        setCaptureStatus('No supported LLM site on active tab');
        setTimeout(() => setCaptureStatus(null), 3000);
      }
    }
  }

  async function captureNow() {
    setCaptureStatus('Capturing...');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      setCaptureStatus('No active tab found');
      setTimeout(() => setCaptureStatus(null), 3000);
      return;
    }
    try {
      const result = await chrome.tabs.sendMessage(tabs[0].id, { type: 'CAPTURE_NOW' });
      if (result?.ok) {
        setCaptureStatus(`Captured ${result.messageCount} messages — extracting...`);
      } else {
        setCaptureStatus(result?.error || 'Capture failed');
      }
      setTimeout(() => setCaptureStatus(null), 5000);
    } catch {
      setCaptureStatus('No supported LLM site on active tab');
      setTimeout(() => setCaptureStatus(null), 3000);
    }
  }

  return (
    <div class="p-4 space-y-6">
      {/* Capture controls */}
      <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div class="flex items-center justify-between">
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
        <button
          onClick={captureNow}
          class="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Capture This Conversation
        </button>
        {captureStatus && (
          <p class="text-xs text-gray-600 text-center">{captureStatus}</p>
        )}
      </div>

      {/* Stats cards */}
      <div class="grid grid-cols-3 gap-3">
        <StatCard label="Total Facts" value={stats.totalFacts} color="blue" />
        <StatCard label="Pending" value={stats.pendingFacts} color="yellow" />
        <StatCard label="Conversations" value={stats.totalConversations} color="green" />
      </div>

      {/* Activity Log */}
      <div>
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-medium text-gray-900">Activity Log</h3>
          {logEntries.length > 0 && (
            <button
              onClick={() => { setLogEntries([]); lastLogId.current = 0; }}
              class="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
        <div class="bg-gray-900 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs">
          {logEntries.length === 0 ? (
            <p class="text-gray-500">Waiting for activity...</p>
          ) : (
            logEntries.map((entry) => (
              <div key={entry.id} class="mb-1">
                <span class="text-gray-500">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>{' '}
                <span class={
                  entry.level === 'error' ? 'text-red-400' :
                  entry.level === 'warn' ? 'text-yellow-400' :
                  'text-green-400'
                }>
                  {entry.message}
                </span>
                {entry.detail && (
                  <div class="text-gray-400 ml-4 break-all">{entry.detail}</div>
                )}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Recent Facts */}
      {recentFacts.length > 0 && (
        <div>
          <h3 class="font-medium text-gray-900 mb-3">Recent Facts</h3>
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
        </div>
      )}
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
