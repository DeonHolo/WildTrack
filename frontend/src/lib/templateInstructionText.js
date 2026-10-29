const decorations = /[\u{1F000}-\u{1FAFF}\u26A0\u2705\u2714\u274C\u2757\u2764\uFE0F\u200D]/gu;
const clean = text => String(text || '').replace(decorations, '').replace(/\s+/g, ' ').trim();
const layout = text => String(text || '').replace(decorations, '').replace(/\r\n?/g, '\n')
  .split('\n').map(line => line.replace(/[\t\p{Zs}]+/gu, ' ').trim()
    .replace(/^(?:[\p{Co}•●▪◦*]|o)\s+/u, '- ')).join('\n')
  .replace(/\n{3,}/g, '\n\n').trim();

export function formatTemplateInstruction(value) {
  const raw = String(value || '');
  // Historical content-slot drafts need a display-only compatibility formatter.
  const slot = raw.match(/^(.*?)\s*Provide content for:\s*(.+)$/s);
  if (!slot) return layout(raw);
  if (slot[2].split('\n').some(line => /^(?:[\p{Co}•●▪◦*]|o|-)\s+/u.test(line.trim())))
    return layout(raw);
  const parent = clean(slot[1]), source = clean(slot[2]);
  const heading = parent && slot[1].split('\n').filter(line => line.trim())
    .every(line => /^\d+(?:\.\d+)*\.?\s+[^.!?;:]{1,160}$/.test(line.trim()));
  const text = heading ? `Provide content for ${source}, under ${parent}`
    : `${parent ? `${parent} ` : ''}Provide content for ${source}`;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
