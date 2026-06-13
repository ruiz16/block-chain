import { describe, it, expect } from 'vitest';
import { creditIdHash } from './credit-id';

describe('creditIdHash', () => {
  it('produces a 0x-prefixed 32-byte hash', () => {
    const h = creditIdHash('123e4567-e89b-12d3-a456-426614174000');
    expect(h).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    expect(creditIdHash(id)).toBe(creditIdHash(id));
  });

  it('differs for different uuids', () => {
    expect(creditIdHash('aaaaaaaa-e89b-12d3-a456-426614174000'))
      .not.toBe(creditIdHash('bbbbbbbb-e89b-12d3-a456-426614174000'));
  });
});
