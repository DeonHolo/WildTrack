const clean = text => String(text || '').replace(/[\u{1F000}-\u{1FAFF}\u26A0\u2705\u2714\u274C\u2757\u2764\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();

export function formatTemplateInstruction(value) {
  const raw = String(value || '');
  const slot = raw.match(/^(.*?)\s*Provide content for:\s*(.+)$/s);
  if (!slot) return clean(raw);
  const parent = clean(slot[1]), source = clean(slot[2]);
  const heading = parent && slot[1].split('\n').filter(line => line.trim())
    .every(line => /^\d+(?:\.\d+)*\.?\s+[^.!?;:]{1,160}$/.test(line.trim()));
  const text = heading ? `Provide content for ${source}, under ${parent}`
    : `${parent ? `${parent} ` : ''}Provide content for ${source}`;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
