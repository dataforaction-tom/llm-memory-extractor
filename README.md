# LLM Memory Extractor

Open-source browser extension that captures your LLM conversations and extracts personal context. Local-first. Fully configurable. Bring your own LLM.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](package.json)

## What It Does

- **Captures conversations** from Claude, ChatGPT, Gemini, Perplexity, Mistral, and Grok
- **Extracts personal facts and preferences** using AI (Ollama locally or cloud APIs)
- **Fully configurable extraction schema** — define your own categories, hints, and examples
- **Stores everything locally** in your browser — your data never leaves unless you choose a cloud LLM

## Quick Start

Install from the [Chrome Web Store](#) (link TBD) or [Firefox Add-ons](#) (link TBD).

Or build from source:

```bash
git clone https://github.com/your-username/llm-memory-extractor
cd llm-memory-extractor
npm install
npm run build:chrome   # or npm run build:firefox
```

**Load unpacked in Chrome:**
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist-chrome/` folder

**Load in Firefox:**
1. Go to `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `dist-firefox/manifest.json`

## Setting Up Ollama (Recommended)

[Ollama](https://ollama.com) lets you run LLMs locally so your conversations never leave your machine.

1. Install Ollama from [https://ollama.com](https://ollama.com)
2. Pull a model:
   ```bash
   ollama pull llama3
   ```
   Other good choices: `mistral`, `phi3`
3. The extension connects to `http://localhost:11434` by default — no configuration needed

## Using a Cloud Provider (BYOK)

If you prefer a cloud LLM, bring your own API key. Keys are stored in your browser's local storage and never sent anywhere except to the provider you choose.

| Provider  | Get API Key                                              | Models                      |
|-----------|----------------------------------------------------------|-----------------------------|
| Anthropic | [console.anthropic.com](https://console.anthropic.com)   | Claude Sonnet, Haiku        |
| OpenAI    | [platform.openai.com](https://platform.openai.com)       | GPT-4o, GPT-4o-mini         |
| Mistral   | [console.mistral.ai](https://console.mistral.ai)         | Mistral models              |
| Google    | [aistudio.google.com](https://aistudio.google.com)       | Gemini 2.0 Flash, 1.5 Pro   |
| GreenPT   | [greenpt.ai](https://greenpt.ai)                        | GreenPT models              |

## How It Works

1. **Toggle capture** on any supported LLM site
2. **Chat normally** — the extension watches for new messages
3. **Stop capture** — your conversation is sent to your chosen LLM for fact extraction
4. **Review extracted facts** in the side panel — confirm, reject, or edit
5. **Facts accumulate** over time, building your personal context memory

## Customizing Your Schema

The extraction schema controls what the extension looks for in your conversations.

- Ships with **22 default categories** (work, health, travel, preferences, etc.)
- Open the **Schema** tab in the side panel to:
  - Add, remove, or edit categories
  - Write extraction hints (tells the LLM what to look for)
  - Add example facts (few-shot examples improve extraction quality)
  - Configure PII rules (block certain patterns)
- Export your schema as JSON and share it with others

## Supported Sites

| Site              | URL                          |
|-------------------|------------------------------|
| Claude            | claude.ai                    |
| ChatGPT           | chatgpt.com                  |
| Gemini            | gemini.google.com            |
| Perplexity        | perplexity.ai                |
| Mistral Le Chat   | chat.mistral.ai              |
| Grok              | grok.com                     |

## Privacy

- All data stored locally in browser IndexedDB
- No server, no account, no telemetry
- Conversations are only sent to your chosen LLM provider for extraction
- With Ollama, everything stays on your machine
- Export your data anytime as markdown or JSON

## Development

```bash
npm run dev              # development mode with HMR
npm run build            # build for both Chrome and Firefox
npm run build:chrome     # build for Chrome only
npm run build:firefox    # build for Firefox only
npm run lint             # type-check with TypeScript
```

## Contributing

PRs welcome! For major changes, please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
