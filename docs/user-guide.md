# User Guide

This guide covers everything you need to know about using LLM Memory Extractor — from capturing your first conversation to building a complete personal memory profile.

## Capturing conversations

LLM Memory Extractor works with six AI chat platforms:

- **Claude** (claude.ai)
- **ChatGPT** (chatgpt.com)
- **Gemini** (gemini.google.com)
- **Perplexity** (perplexity.ai)
- **Mistral Chat** (chat.mistral.ai)
- **Grok** (grok.x.ai)

When you visit any of these sites, a small floating button appears in the corner of the page. Click it to start recording. The button changes colour to show it's active. Click it again to stop — or just navigate away. The extension reads the conversation from the page and sends it for extraction.

You can also trigger a one-shot capture from the Dashboard without toggling recording on and off.

## The Dashboard

Open the side panel by clicking the extension icon in your browser toolbar. The Dashboard is the first thing you see.

It shows:

- **Stats** — total facts, pending reviews, confirmed facts, and conversations captured
- **Recent facts** — the latest facts pulled from your conversations
- **Capture status** — whether recording is active on the current tab
- **Activity log** — a live feed of what the extension is doing behind the scenes (useful for troubleshooting)

## Reviewing facts

Switch to the **Facts** tab to see everything the extension has extracted. Each fact has a status:

- **Pending** — freshly extracted, waiting for your review
- **Confirmed** — you've approved it as accurate
- **Rejected** — you've marked it as incorrect or unwanted

Use the filters at the top to narrow the list by status, category, or a text search. Each fact card shows the extracted key and value, which category it belongs to, a confidence score, and the evidence quote from the original conversation.

You can **confirm**, **reject**, or **delete** individual facts. If you have many pending facts, use **Confirm All** to approve them in one go.

When you confirm a fact, you'll see a prompt to head over to the Documents tab to merge it into your memory profile.

## Documents

The **Documents** tab is where your confirmed facts come together into readable memory documents. There's one document per category — for example, "Work & Career" or "Health & Wellness".

Rather than just listing bullet points, the extension uses your LLM provider to write each document as a coherent narrative that synthesises all the facts in that category.

### Merging new facts

When you have unmerged confirmed facts for a category, you'll see a badge showing how many are waiting. Click **Merge** to have the LLM integrate them into the existing document. Before the merge is applied, you'll see a **diff view** highlighting exactly what changed — additions in green, removals in red. You can accept or discard the merge.

### Editing documents

You can edit any document directly. Click on a document to open it, and make changes in the editor. For more space, use the **pop-out editor** to open the document in a larger window.

### Version history

Every merge and manual edit creates a new version. Open the **Version History** panel to browse previous versions and restore any earlier state if needed.

### Saving to your computer

If your browser supports the File System Access API, you can pick a local folder and sync your documents there as markdown files. This is handy for backing up your memory profile or using it with other tools. You can also download individual documents at any time.

## Customising the schema

The **Schema** tab lets you control how facts are organised. The extension ships with 22 categories covering common areas of life — identity, work, health, hobbies, relationships, and more.

You can:

- **Enable or disable categories** — turn off anything you don't want tracked
- **Edit category details** — change the name, description, and extraction hints that guide the LLM
- **Add new categories** — create custom categories for things specific to your life
- **Configure PII rules** — control which patterns (like phone numbers or addresses) get flagged before facts are confirmed

## Settings

The **Settings** tab handles your LLM provider and data management.

### Choosing a provider

The extension needs an LLM to extract facts from conversations and merge them into documents. You can choose from:

- **Ollama** — runs locally on your machine, no API key needed. Great for privacy since nothing leaves your computer.
- **OpenAI** — uses GPT models via the OpenAI API. Requires an API key.
- **Anthropic** — uses Claude models via the Anthropic API. Requires an API key.
- **Mistral** — uses Mistral models via their API. Requires an API key.
- **Google** — uses Gemini models via the Google AI API. Requires an API key.
- **GreenPT** — an alternative endpoint. Requires an API key.

Select your provider, enter your API key if needed, and optionally choose a specific model.

### Exporting and importing

- **Export as Markdown** — downloads your confirmed facts as markdown files, one per category
- **Export as JSON** — creates a full backup of all your data (facts, conversations, schema, documents)
- **Import JSON** — restore from a previous backup

### Filesystem sync

If available, you can set a sync folder where your memory documents are automatically saved as markdown files. Use **Sync All** to push all documents at once, or sync individual documents from the Documents tab.

### Clearing data

You can clear all facts, all conversations, or reset the schema back to defaults. These actions are permanent, so export a backup first if you want to keep anything.
