import { describe, expect, it } from 'vitest';
import { formatDateInput, maskDateInput, parseDateInput, yearPageStart } from './date-input';

describe('maskDateInput', () => {
  it('inserts the slashes while digits are typed', () => {
    expect(maskDateInput('1')).toBe('1');
    expect(maskDateInput('14')).toBe('14');
    expect(maskDateInput('141')).toBe('14/1');
    expect(maskDateInput('1411')).toBe('14/11');
    expect(maskDateInput('14112026')).toBe('14/11/2026');
  });

  it('keeps an already formatted date as is', () => {
    expect(maskDateInput('14/11/2026')).toBe('14/11/2026');
    expect(maskDateInput('14/1')).toBe('14/1');
  });

  it('pads a one-digit day or month when the user types the separator', () => {
    expect(maskDateInput('1/')).toBe('01/');
    expect(maskDateInput('1/2/')).toBe('01/02/');
    expect(maskDateInput('1-2-2026')).toBe('01/02/2026');
    expect(maskDateInput('1.2.26')).toBe('01/02/26');
  });

  it('lets backspace remove a trailing slash', () => {
    expect(maskDateInput('14')).toBe('14');
    expect(maskDateInput('14/11')).toBe('14/11');
  });

  it('ignores letters, extra digits and repeated separators', () => {
    expect(maskDateInput('1a4//11x2026999')).toBe('14/11/2026');
    expect(maskDateInput('/')).toBe('');
  });

  it('converts a pasted ISO date', () => {
    expect(maskDateInput('2026-11-14')).toBe('14/11/2026');
  });
});

describe('parseDateInput', () => {
  const today = '2026-11-14';

  it('parses a full date', () => {
    expect(parseDateInput('14/11/2026', today)).toBe('2026-11-14');
    expect(parseDateInput('1/2/2026', today)).toBe('2026-02-01');
  });

  it('expands a two-digit year to the closest century', () => {
    expect(parseDateInput('14/11/26', today)).toBe('2026-11-14');
    expect(parseDateInput('01/01/46', today)).toBe('2046-01-01');
    expect(parseDateInput('01/01/47', today)).toBe('1947-01-01');
    expect(parseDateInput('20/05/90', today)).toBe('1990-05-20');
  });

  it('rejects dates that do not exist', () => {
    expect(parseDateInput('31/02/2026', today)).toBeNull();
    expect(parseDateInput('29/02/2026', today)).toBeNull();
    expect(parseDateInput('29/02/2028', today)).toBe('2028-02-29');
    expect(parseDateInput('00/01/2026', today)).toBeNull();
    expect(parseDateInput('10/13/2026', today)).toBeNull();
    expect(parseDateInput('10/10/0999', today)).toBeNull();
  });

  it('rejects incomplete text', () => {
    expect(parseDateInput('', today)).toBeNull();
    expect(parseDateInput('14/11', today)).toBeNull();
    expect(parseDateInput('14/11/202', today)).toBeNull();
  });
});

describe('formatDateInput', () => {
  it('shows an ISO date as dd/mm/aaaa', () => {
    expect(formatDateInput('2026-11-14')).toBe('14/11/2026');
    expect(formatDateInput('')).toBe('');
    expect(formatDateInput(undefined)).toBe('');
  });
});

describe('yearPageStart', () => {
  it('groups years in pages of twelve', () => {
    expect(yearPageStart(2026)).toBe(2016);
    expect(yearPageStart(2016)).toBe(2016);
    expect(yearPageStart(2015)).toBe(2004);
  });
});
