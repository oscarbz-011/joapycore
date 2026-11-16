import { describe, expect, it } from 'vitest';
import { birthDateForPayload, birthDateFromCustomer } from './customer-birth-date';

describe('birthDateFromCustomer', () => {
  it('keeps only the day the backend stored', () => {
    expect(birthDateFromCustomer('1990-05-20T00:00:00.000Z')).toBe('1990-05-20');
  });

  it('leaves the field empty when there is no date', () => {
    expect(birthDateFromCustomer(null)).toBe('');
    expect(birthDateFromCustomer(undefined)).toBe('');
  });
});

describe('birthDateForPayload', () => {
  it('sends the day of a person', () => {
    expect(birthDateForPayload('1990-05-20', false)).toBe('1990-05-20');
  });

  it('sends null to clear an empty field', () => {
    expect(birthDateForPayload('', false)).toBeNull();
    expect(birthDateForPayload(undefined, false)).toBeNull();
  });

  it('never sends a date for a company', () => {
    expect(birthDateForPayload('1990-05-20', true)).toBeNull();
  });
});
