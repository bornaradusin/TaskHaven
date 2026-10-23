// Descriptions and comments are a little HTML (from the editor). Others in a project write them,
// so before showing any, everything but plain formatting is taken out.

const ALLOWED = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'S', 'U', 'DEL', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'CODE', 'PRE', 'A', 'HR', 'DIV', 'SPAN'])
const ATTRIBUTES: Record<string, string[]> = {
  A: ['href'],
  UL: ['data-type'],
  LI: ['data-checked'],
}

export function sanitize(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  clean(doc.body)
  return doc.body.innerHTML
}

function clean(node: Element): void {
  for (const child of [...node.children]) {
    if (!ALLOWED.has(child.tagName)) {
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'IMG', 'VIDEO', 'AUDIO', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].includes(child.tagName)) {
        child.remove()
        continue
      }
      // keep what's inside, lose the tag
      clean(child)
      child.replaceWith(...child.childNodes)
      continue
    }
    const keep = ATTRIBUTES[child.tagName] ?? []
    for (const attr of [...child.attributes]) {
      if (!keep.includes(attr.name)) child.removeAttribute(attr.name)
    }
    if (child.tagName === 'A') {
      const href = child.getAttribute('href') ?? ''
      if (!/^(https?:|mailto:|tel:)/i.test(href.trim())) child.removeAttribute('href')
      child.setAttribute('target', '_blank')
      child.setAttribute('rel', 'noopener noreferrer')
    }
    if (child.tagName === 'UL' && child.getAttribute('data-type') !== 'taskList') child.removeAttribute('data-type')
    if (child.tagName === 'LI' && !['true', 'false'].includes(child.getAttribute('data-checked') ?? '')) child.removeAttribute('data-checked')
    clean(child)
  }
}

/** The words in some HTML (for previews and notices). */
export function toText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const br of doc.querySelectorAll('br, p, li, h1, h2, h3, div')) br.append(' ')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Plain text (old notes, pasted text) as HTML paragraphs. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Whether HTML has anything in it. */
export function isEmpty(html: string): boolean {
  return !toText(html) && !/<(hr|li)\b/i.test(html)
}

/** Counts a description's checklist: [done, all]. */
export function checklist(html: string): [number, number] {
  const all = (html.match(/<li[^>]*data-checked=/g) ?? []).length
  const done = (html.match(/<li[^>]*data-checked="true"/g) ?? []).length
  return [done, all]
}
