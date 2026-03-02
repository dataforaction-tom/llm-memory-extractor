# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Capture conversations** from six AI platforms: Claude, ChatGPT, Gemini, Perplexity, Mistral Chat, and Grok
- **Automatic fact extraction** — an LLM reads your conversations and pulls out personal facts, preferences, and details about you
- **Dashboard** with stats overview, recent facts, live activity log, and capture controls
- **Facts page** for reviewing, confirming, rejecting, and deleting extracted facts, with filtering by status, category, and search
- **Bulk actions** — confirm or reject all pending facts at once
- **22 built-in categories** for organising facts (Identity, Work, Health, Hobbies, and more)
- **Schema editor** for customising categories, adding your own, and configuring PII detection rules
- **Documents tab** — confirmed facts are merged into rich markdown memory documents, one per category, using an LLM to write coherent prose rather than flat lists
- **Diff review** — see exactly what changed before accepting a merge into your documents
- **Version history** — browse and restore previous versions of any document
- **Pop-out editor** — open any document in a larger editing window
- **Filesystem sync** — save documents to a local folder and keep them in sync
- **Markdown and JSON export** — download your facts or full backup at any time
- **JSON import** — restore from a previous backup
- **PII detection** — flags facts that might contain sensitive personal information before you confirm them
- **Deduplication** — automatically skips facts you've already captured
- **Bring your own key** — connect to Ollama (local), OpenAI, Anthropic, Mistral, Google, or GreenPT for extraction and merging
- **Cross-browser support** — works on both Chrome and Firefox
- **Floating capture button** — appears on supported sites, injected via shadow DOM so it never interferes with the page
- **Side panel interface** with five tabs: Dashboard, Facts, Documents, Schema, and Settings
