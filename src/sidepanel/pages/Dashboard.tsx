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
  const [activityOpen, setActivityOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const lastLogId = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  async function syncCaptureState() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      try {
        const result = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CAPTURE_STATE' });
        setCapturing(result?.recording ?? false);
      } catch {
        setCapturing(false);
      }
    }
  }

  useEffect(() => {
    loadStats();
    loadRecentFacts();
    syncCaptureState();

    const handleMessage = (msg: any) => {
      if (msg.type === 'CAPTURE_STATE_CHANGED') {
        setCapturing(msg.recording);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    // Poll activity log every 2 seconds
    pollLog();
    const interval = setInterval(pollLog, 2000);
    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
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
        loadStats();
        loadRecentFacts();
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    } catch {
      // Service worker might not be ready
    }
  }

  async function toggleCapture() {
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
    <div class="p-4 space-y-5">
      {/* Capture controls */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-ink">Memory Capture</h3>
            <p class="text-xs text-ink-muted mt-0.5">
              {capturing ? 'Recording conversations...' : 'Capture is off'}
            </p>
          </div>
          <button
            onClick={toggleCapture}
            class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              capturing ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              class={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-sm transition-transform ${
                capturing ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <button
          onClick={captureNow}
          class="w-full py-2 px-3 bg-accent hover:bg-accent-hover text-surface text-sm font-medium rounded-md transition-colors"
        >
          Capture This Conversation
        </button>
        {captureStatus && (
          <p class="text-xs text-ink-muted text-center">{captureStatus}</p>
        )}
      </div>

      {/* Stats */}
      <div class="grid grid-cols-3 gap-3">
        <div class="text-center">
          <p class="text-2xl font-serif text-ink">{stats.totalFacts}</p>
          <p class="text-[11px] text-ink-muted">Total Facts</p>
        </div>
        <div class="text-center">
          <p class="text-2xl font-serif text-ochre">{stats.pendingFacts}</p>
          <p class="text-[11px] text-ink-muted">Pending</p>
        </div>
        <div class="text-center">
          <p class="text-2xl font-serif text-ink">{stats.totalConversations}</p>
          <p class="text-[11px] text-ink-muted">Conversations</p>
        </div>
      </div>

      {/* Activity Log */}
      <div>
        <button
          onClick={() => setActivityOpen(!activityOpen)}
          class="flex items-center justify-between w-full mb-2"
        >
          <h3 class="text-sm font-medium text-ink flex items-center gap-1.5">
            <svg class={`w-3 h-3 text-ink-muted transition-transform ${activityOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5l8 7-8 7z" />
            </svg>
            Activity
            {logEntries.length > 0 && (
              <span class="text-[10px] text-ink-muted font-normal">({logEntries.length})</span>
            )}
          </h3>
          {activityOpen && logEntries.length > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); setLogEntries([]); lastLogId.current = 0; }}
              class="text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
            >
              Clear
            </span>
          )}
        </button>
        {activityOpen && (
          <div class="bg-log-bg rounded-md p-3 max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {logEntries.length === 0 ? (
              <p class="text-log-text">Waiting for activity...</p>
            ) : (
              logEntries.map((entry) => (
                <div key={entry.id} class="mb-1">
                  <span class="text-log-text">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>{' '}
                  <span class={
                    entry.level === 'error' ? 'text-log-error' :
                    entry.level === 'warn' ? 'text-log-warn' :
                    'text-log-info'
                  }>
                    {entry.message}
                  </span>
                  {entry.detail && (
                    <div class="text-log-text ml-4 break-all opacity-75">{entry.detail}</div>
                  )}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Recent Facts */}
      {recentFacts.length > 0 && (
        <div>
          <button
            onClick={() => setRecentOpen(!recentOpen)}
            class="flex items-center w-full mb-2"
          >
            <h3 class="text-sm font-medium text-ink flex items-center gap-1.5">
              <svg class={`w-3 h-3 text-ink-muted transition-transform ${recentOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5l8 7-8 7z" />
              </svg>
              Recent
              <span class="text-[10px] text-ink-muted font-normal">({recentFacts.length})</span>
            </h3>
          </button>
          {recentOpen && (
            <div class="space-y-1">
              {recentFacts.map((fact) => (
                <div key={fact.id} class="py-2.5 border-b border-border-light last:border-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[11px] text-accent font-medium">
                      {fact.categoryId}
                    </span>
                    <span class="text-[11px] text-ink-muted">
                      {new Date(fact.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p class="text-sm font-medium text-ink">{fact.key.replace(/_/g, ' ')}</p>
                  <p class="text-xs text-ink-secondary truncate mt-0.5">
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
      )}
    </div>
  );
}
