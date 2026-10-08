import { describe, expect, it } from 'vitest';
import { customerFullName, documentTypeLabel } from './customers';

describe('customerFullName', () => {
  it('joins every name the customer has', () => {
    expect(
      customerFullName({
        firstName: 'María',
        secondFirstName: 'José',
        lastName: 'López',
        secondLastName: 'Giménez',
      }),
    ).toBe('María José López Giménez');
  });

  it('leaves no gaps where a name is missing', () => {
    expect(
      customerFullName({
        firstName: 'Oscar',
        secondFirstName: null,
        lastName: 'Baez',
        secondLastName: '',
      }),
    ).toBe('Oscar Baez');
  });
});

describe('documentTypeLabel', () => {
  it('names the document type as people read it', () => {
    expect(documentTypeLabel('CI')).toBe('C.I.');
    expect(documentTypeLabel('RUC')).toBe('RUC');
    expect(documentTypeLabel('PASSPORT')).toBe('Pasaporte');
    expect(documentTypeLabel(null)).toBeNull();
  });
});
