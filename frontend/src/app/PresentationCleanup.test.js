import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');
const repositoryRoot = path.resolve(process.cwd(), '..');
const indexCss = fs.readFileSync(path.join(sourceRoot, 'styles', 'index.css'), 'utf8');
const wildTrackCss = fs.readFileSync(path.join(sourceRoot, 'styles', 'wildtrack.css'), 'utf8');
const readme = fs.readFileSync(path.join(repositoryRoot, 'README.md'), 'utf8');
const retiredBrand = ['Cap', 'Vault'].join('');

function productSource() {
  return walk(sourceRoot)
    .filter((file) => /\.(jsx|js)$/.test(file) && !/\.test\./.test(file))
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

    expect(source.toLowerCase()).not.toContain(retiredBrand.toLowerCase());
    expect(readme.toLowerCase()).not.toContain(retiredBrand.toLowerCase());
    expect(source).not.toMatch(/(['"`])[^\n]*\bMVP\b[^\n]*\1/i);
    expect(source).not.toMatch(/(['"`])[^\n]*\bTier\s*1\b[^\n]*\1/i);
    expect(source).not.toMatch(/(['"`])[^\n]*presentation fallback[^\n]*\1/i);
    expect(source).not.toMatch(/(['"`])[^\n]*demo import[^\n]*\1/i);
  });

  it('keeps legacy compatibility styles from leaking into Mantine tables and fields', () => {
    expect(indexCss).not.toMatch(/^table\s*\{/m);
    expect(indexCss).not.toMatch(/^th\s*\{/m);
    expect(indexCss).not.toMatch(/^td\s*\{/m);
    expect(indexCss).not.toMatch(/^textarea\s*\{/m);
    expect(indexCss).not.toMatch(/\.(?:segmented-control|icon-button|btn(?:[-\s:{.,]))/);
  });

  it('uses the WildTrack type and color system in both style layers', () => {
    expect(indexCss).toContain('Manrope Variable');
    expect(indexCss).not.toContain('#0f766e');
    expect(indexCss).not.toContain('#2563eb');
    expect(wildTrackCss).toContain('--wt-maroon');
    expect(wildTrackCss).toContain('--wt-gold');
  });
});
