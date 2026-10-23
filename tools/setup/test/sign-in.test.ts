// The back office sign-in shown at the end of `pnpm start`.
import { describe, expect, it } from 'vitest';

import { backOfficeSignIn } from '../src/sign-in.ts';

describe('the back office sign-in', () => {
  it('shows the address and the first admin’s email, and says where the password is', () => {
    expect(backOfficeSignIn(undefined, 'ana@example.org')).toEqual([
      '',
      'Sign in to the back office (and the viewer portal):',
      '  address   https://office.adms.localhost',
      '  email     ana@example.org',
      '  password  the password you just set',
    ]);
  });

  it('carries a port other than 443', () => {
    expect(backOfficeSignIn('8443', 'a@b.co')[2]).toBe(
      '  address   https://office.adms.localhost:8443',
    );
  });
});
