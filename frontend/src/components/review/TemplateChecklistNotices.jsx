import { Anchor, Stack, Text } from '@mantine/core';

export function TemplateChecklistNotices({ entries = [] }) {
  const templates = new Map();
  for (const entry of entries) {
    if (entry.resultStatus !== 'TEMPLATE_APPROVAL_REQUIRED') continue;
    const url = entry.templateChecklistUrl;
    if (!/^\/templates\/[a-f0-9-]{36}\/preview\?workspaceId=[a-f0-9-]{36}$/i.test(url || '')) continue;
    if (!templates.has(url)) templates.set(url, { name: entry.identity?.deliverableTitle || 'Template checklist', count: 0 });
    templates.get(url).count += 1;
  }
  if (!templates.size) return null;
  return <Stack gap="xs">
    <Text fw={600}>Template checklists need approval</Text>
    <Text>No AI reviews started for these submissions. Check and approve each template checklist first, then run a new precheck.</Text>
    {[...templates].map(([url, template]) => <Text key={url}>
      <Anchor href={url}>{template.name}</Anchor> · {template.count} {template.count === 1 ? 'submission' : 'submissions'}
    </Text>)}
  </Stack>;
}
