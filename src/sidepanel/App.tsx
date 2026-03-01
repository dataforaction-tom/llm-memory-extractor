import { useState } from 'preact/hooks';
import { Dashboard } from './pages/Dashboard';
import { Facts } from './pages/Facts';
import { SchemaEditor } from './pages/SchemaEditor';
import { Settings } from './pages/Settings';

function DashboardIcon(props: Record<string, unknown>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function FactsIcon(props: Record<string, unknown>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function SchemaIcon(props: Record<string, unknown>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

function SettingsIcon(props: Record<string, unknown>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
  { id: 'facts', label: 'Facts', icon: FactsIcon },
  { id: 'schema', label: 'Schema', icon: SchemaIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

type TabId = typeof TABS[number]['id'];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  return (
    <div class="flex flex-col h-screen">
      {/* Header */}
      <header class="bg-white border-b border-gray-200 px-4 py-3">
        <h1 class="text-lg font-semibold text-gray-900">LLM Memory</h1>
      </header>

      {/* Content */}
      <main class="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'facts' && <Facts />}
        {activeTab === 'schema' && <SchemaEditor />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* Tab bar */}
      <nav class="bg-white border-t border-gray-200 flex">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            class={`flex-1 flex flex-col items-center py-2 px-1 text-xs ${
              activeTab === tab.id
                ? 'text-green-600 border-t-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon class="w-5 h-5 mb-0.5" />
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
