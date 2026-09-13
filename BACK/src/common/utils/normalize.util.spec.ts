import { toTitleCase, toUpperNorm } from './normalize.util';

describe('toTitleCase', () => {
  it.each([
    ['juan perez', 'Juan Perez'],
    ['  ANA   LÓPEZ ', 'Ana   López'],
    ['maría josé', 'María José'],
    ['ñandú', 'Ñandú'],
    ['peña', 'Peña'],
    ["o'higgins", "O'Higgins"],
    ['maría-josé', 'María-José'],
    ['ÁLVAREZ GÓMEZ', 'Álvarez Gómez'],
    ['müller', 'Müller'],
  ])('%s -> %s', (input, expected) => {
    expect(toTitleCase(input)).toBe(expected);
  });

  // Regresión: con /\b\w/ la letra que seguía a una tilde se tomaba como
  // comienzo de palabra.
  it('does not capitalize the letter after an accented character', () => {
    expect(toTitleCase('lópez')).not.toBe('LóPez');
    expect(toTitleCase('pérez')).toBe('Pérez');
  });
});

describe('toUpperNorm', () => {
  it('trims and uppercases, keeping accents', () => {
    expect(toUpperNorm('  televisores ñandú ')).toBe('TELEVISORES ÑANDÚ');
  });
});
