import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');
const indexCss = fs.readFileSync(path.join(sourceRoot, 'styles', 'index.css'), 'utf8');
const wildTrackCss = fs.readFileSync(path.join(sourceRoot, 'styles', 'wildtrack.css'), 'utf8');

function productSource() {
  return ['pages', 'components', 'app'].flatMap((directory) => walk(path.join(sourceRoot, directory)))
    .filter((file) => /\.(jsx|js)$/.test(file) && !/\.test\./.test(file))
    .filter((file) => !file.endsWith(path.join('app', 'WorkflowContext.jsx')))
    .filter((file) => !file.endsWith(path.join('components', 'layout', 'DevelopmentRolePreview.jsx')))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

describe('WildTrack presentation cleanup', () => {
  it('does not expose retired product or internal release terminology', () => {
    const source = productSource();

    expect(source).not.toMatch(/(['"`])[^\n]*\bCapVault\b[^\n]*\1/i);
    expect(source).not.toMatch(/(['"`])[^\n]*\bMVP\b[^\n]*\1/i);
    expect(source).not.toMatch(/(['"`])[^\n]*\bTier\s*1\b[^\n]*\1/i);
    expect(source).not.toMatch(/(['"`])[^\n]*presentation fallback[^\n]*\1/i);
  });

  it('keeps legacy compatibility styles from leaking into Mantine tables and fields', () => {
    expect(indexCss).not.toMatch(/^table\s*\{/m);
    expect(indexCss).not.toMatch(/^th\s*\{/m);
    expect(indexCss).not.toMatch(/^td\s*\{/m);
    expect(indexCss).not.toMatch(/^textarea\s*\{/m);
  });

  it('uses the WildTrack type and color system in both style layers', () => {
    expect(indexCss).toContain('Manrope Variable');
    expect(indexCss).not.toContain('#0f766e');
    expect(indexCss).not.toContain('#2563eb');
    expect(wildTrackCss).toContain('--wt-maroon');
    expect(wildTrackCss).toContain('--wt-gold');
  });
});
