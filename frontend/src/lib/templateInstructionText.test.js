import { describe, expect, it } from 'vitest';
import { formatTemplateInstruction } from './templateInstructionText.js';

describe('readable template instruction formatting', () => {
  it('places a content slot and its exact parent heading in one sentence', () => {
    expect(formatTemplateInstruction('1. Introduction\n\nProvide content for:\n1.3 Definitions and Acronyms'))
      .toBe('Provide content for 1.3 Definitions and Acronyms, under 1. Introduction.');
  });
  it('retains every qualifier and mathematical limit while removing decorative emoji', () => {
    expect(formatTemplateInstruction('✅ For each transaction,\n if applicable, explain x ≤ 5 and 90%.\n\nProvide content for:\nData design'))
      .toBe('For each transaction, if applicable, explain x ≤ 5 and 90%. Provide content for Data design.');
  });
  it('does not rewrite an ordinary direction', () => {
    expect(formatTemplateInstruction('Describe the purpose.\n\nIdentify its intended users.'))
      .toBe('Describe the purpose. Identify its intended users.');
  });
  it('preserves symbols that can be meaningful rather than decorative', () => {
    const instruction = 'Keep ©, ®, ™, x ✕ y, a ➕ b, and x ≤ 5.';
    expect(formatTemplateInstruction(instruction)).toBe(instruction);
  });
});
