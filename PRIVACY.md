# Privacy Policy — LLM Memory Extractor

**Last updated:** 2 March 2026

## Summary

LLM Memory Extractor stores all data locally in your browser. Nothing is sent to us. We have no servers, no accounts, and no analytics.

## What data is processed

The extension processes:

- **Conversation content** from supported AI chat platforms (Claude, ChatGPT, Gemini, Perplexity, Mistral, Grok) to extract personal facts and preferences
- **Personal facts** extracted from those conversations, including names, preferences, habits, and other personal context you share with AI assistants
- **Memory documents** generated from your extracted facts

## Where data is stored

All data is stored **exclusively in your browser** using IndexedDB and chrome.storage.local. This includes:

- Extracted facts and their metadata
- Captured conversation content
- Memory documents and version history
- Your extraction schema and settings
- LLM provider configuration and API keys

No data is stored on any external server controlled by us. We do not operate any servers.

## What data is transmitted

The extension sends data to **one destination only**: the LLM provider you configure in Settings. This is required to extract facts from conversations and generate documents. You choose the provider:

- **Ollama (local)** — all processing happens on your machine, nothing leaves your device
- **Cloud providers** (Anthropic, OpenAI, Google, Mistral, or custom endpoint) — conversation excerpts and document content are sent to that provider's API for processing, subject to that provider's own privacy policy

We do not receive, intercept, or have access to any data sent to your chosen provider.

## What we collect

Nothing. We collect:

- No analytics or telemetry
- No usage data
- No crash reports
- No personal information
- No account information (there are no accounts)

## Third-party services

The only third-party service involved is the LLM provider you choose to configure. We have no affiliation with any provider. Their privacy policies apply to data you send them:

- [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
- [OpenAI Privacy Policy](https://openai.com/privacy)
- [Google Privacy Policy](https://policies.google.com/privacy)
- [Mistral Privacy Policy](https://mistral.ai/terms/#privacy-policy)

## Data deletion

You can delete all stored data at any time from the extension's Settings page:

- **Clear All Facts** — removes all extracted facts
- **Clear All Conversations** — removes all captured conversation content
- **Reset Everything** — removes all data and restores default settings

Uninstalling the extension also removes all stored data.

## Children's privacy

This extension is not directed at children under 13 and does not knowingly process data from children.

## Changes to this policy

Changes will be posted to this page with an updated date. Continued use of the extension after changes constitutes acceptance.

## Contact

For questions about this privacy policy, open an issue at [github.com/dataforaction-tom/llm-memory-extractor](https://github.com/dataforaction-tom/llm-memory-extractor/issues).
