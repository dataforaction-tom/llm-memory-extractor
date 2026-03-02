/**
 * Render simple markdown to HTML.
 * Supports: # headings, - bullets, **bold**, *italic*, `code`
 */
export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Close list if we leave bullet context
    if (inList && !trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      html.push('</ul>');
      inList = false;
    }

    // Empty line
    if (!trimmed) {
      html.push('<br/>');
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level} class="md-h${level}">${inlineFormat(escape(headingMatch[2]))}</h${level}>`);
      continue;
    }

    // Bullets
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        html.push('<ul class="md-ul">');
        inList = true;
      }
      html.push(`<li class="md-li">${inlineFormat(escape(trimmed.slice(2)))}</li>`);
      continue;
    }

    // Paragraph
    html.push(`<p class="md-p">${inlineFormat(escape(trimmed))}</p>`);
  }

  if (inList) html.push('</ul>');

  return html.join('\n');
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
