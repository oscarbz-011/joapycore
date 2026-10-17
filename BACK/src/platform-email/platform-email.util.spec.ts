import {
  addressOf,
  remainingToday,
  replyAddress,
  resendTag,
  sharedSender,
  systemSender,
  tenantLocalPart,
  tenantSender,
} from './platform-email.util';

describe('tenantLocalPart', () => {
  it('turns the company name into an address', () => {
    expect(tenantLocalPart('Ferretería El Tornillo S.R.L.')).toBe(
      'ferreteria-el-tornillo-s-r-l',
    );
    expect(tenantLocalPart('  Ñandutí & Cía  ')).toBe('nanduti-cia');
  });

  it('has a fallback for a name with nothing usable', () => {
    expect(tenantLocalPart('***')).toBe('empresa');
    expect(tenantLocalPart('')).toBe('empresa');
  });

  it('stays within a sensible length without a trailing dash', () => {
    const local = tenantLocalPart(`${'a'.repeat(47)} bcd`);
    expect(local.length).toBeLessThanOrEqual(48);
    expect(local.endsWith('-')).toBe(false);
  });
});

describe('tenantSender', () => {
  it('shows the company and says it comes through the platform', () => {
    expect(
      tenantSender('Mi Empresa', 'JoapyCore', 'correo.joapycore.com'),
    ).toEqual({
      address: 'mi-empresa@correo.joapycore.com',
      name: 'Mi Empresa vía JoapyCore',
      header: '"Mi Empresa vía JoapyCore" <mi-empresa@correo.joapycore.com>',
    });
  });

  // Un nombre con comillas o saltos de línea no puede romper el encabezado.
  it('cannot be used to inject headers', () => {
    const sender = tenantSender(
      'Evil" <x@evil.com>\r\nBcc: all@evil.com',
      'JoapyCore',
      'correo.joapycore.com',
    );

    expect(sender.header).not.toMatch(/[\r\n]/);
    expect(sender.name).not.toMatch(/["<>]/);
    expect(sender.header.endsWith('@correo.joapycore.com>')).toBe(true);
  });
});

describe('systemSender', () => {
  it('is the address of the platform itself', () => {
    expect(
      systemSender('JoapyCore', 'no-reply', 'correo.joapycore.com').header,
    ).toBe('"JoapyCore" <no-reply@correo.joapycore.com>');
  });
});

describe('replyAddress', () => {
  it('accepts a real address, trimmed and lowercased', () => {
    expect(replyAddress(' Ventas@MiEmpresa.com ')).toBe('ventas@miempresa.com');
  });

  it('refuses what cannot receive a reply', () => {
    expect(replyAddress(null)).toBeNull();
    expect(replyAddress('')).toBeNull();
    expect(replyAddress('ventas@')).toBeNull();
    expect(replyAddress('a@b.com, c@d.com')).toBeNull();
  });
});

describe('sharedSender', () => {
  it('puts the name of whoever sends on a fixed address', () => {
    expect(
      sharedSender('avisos@joapycore.com', 'Mi Empresa vía JoapyCore'),
    ).toEqual({
      address: 'avisos@joapycore.com',
      name: 'Mi Empresa vía JoapyCore',
      header: '"Mi Empresa vía JoapyCore" <avisos@joapycore.com>',
    });
  });

  it('does not let a name break the header', () => {
    expect(
      sharedSender('a@b.com', 'Mala "Empresa" <x@y.com>\r\nBcc: z@z.com')
        .header,
    ).toBe('"Mala Empresa x@y.com Bcc: z@z.com" <a@b.com>');
  });
});

describe('addressOf', () => {
  it('reads the address of a sender written with or without a name', () => {
    expect(addressOf('avisos@joapycore.com')).toBe('avisos@joapycore.com');
    expect(addressOf('JoapyCore <Avisos@JoapyCore.com>')).toBe(
      'avisos@joapycore.com',
    );
  });

  it('is null when there is no address', () => {
    expect(addressOf(undefined)).toBeNull();
    expect(addressOf('JoapyCore')).toBeNull();
    expect(addressOf('JoapyCore <>')).toBeNull();
  });
});

describe('remainingToday', () => {
  it('counts down to zero and never below', () => {
    expect(remainingToday(0, 200)).toBe(200);
    expect(remainingToday(199, 200)).toBe(1);
    expect(remainingToday(250, 200)).toBe(0);
  });
});

describe('resendTag', () => {
  it('keeps only what the provider accepts', () => {
    expect(resendTag('3f2a-11ee_ok')).toBe('3f2a-11ee_ok');
    expect(resendTag('purchase.order emailed')).toBe('purchase_order_emailed');
  });
});
