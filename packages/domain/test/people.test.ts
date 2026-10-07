// Who may do what at the back office, and the rules of the firm's people (ARCHITECTURE §6,
// Authorization, §7.0; AC-02-08, 11, 12, 13, 72; AC-10-27; ADR-050, 105, 169, 315, 415).
import { describe, expect, it } from 'vitest';

import { Access, PeopleRules, backOfficeCreated, permissions, type Holder } from '../src/index.ts';

const roles = ['ADMIN', 'MANAGER_ANALYST', 'MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM'];
const dana: Holder = { role: 'ADMIN', archived: false, granted: [] };
// Luis holds what the golden mission grants him, and not *unlock*.
const luis: Holder = {
  role: 'MANAGER_ANALYST',
  archived: false,
  granted: ['CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC', 'LOCK_INVOICED'],
};
const ana: Holder = { role: 'MONITOR', archived: false, granted: [] };
const viewer: Holder = { role: 'READ_ONLY_VIEWER', archived: false, granted: [] };
const backOffice = ['ADMIN', 'MANAGER_ANALYST'];

describe('who holds a permission', () => {
  it('AC-02-11 the permissions are one closed set of ten, and an admin needs none granted', () => {
    expect(permissions).toEqual([
      'CORRECT',
      'RENUMBER',
      'VOID',
      'ACCEPT_FLAG',
      'QC',
      'LOCK_INVOICED',
      'UNLOCK_INVOICED',
      'APPROVE_HOURS',
      'SETUP',
      'DISPATCH',
    ]);
    expect(permissions.every((permission) => new Access(dana).holds(permission))).toBe(true);
  });

  it('AC-02-12 a manager/analyst holds the ones granted and no other: Luis voids, and doesn’t unlock', () => {
    const access = new Access(luis);
    expect(permissions.filter((permission) => access.holds(permission))).toEqual(luis.granted);
    expect(access.holds('UNLOCK_INVOICED')).toBe(false);
  });

  it('AC-02-12 one taken away is no longer held', () => {
    const without = { ...luis, granted: luis.granted.filter((held) => held !== 'VOID') };
    expect(new Access(without).holds('VOID')).toBe(false);
    expect(new Access(without).holds('CORRECT')).toBe(true);
  });

  it('a monitor, a read-only viewer and the system actor hold none, whatever a grant row says', () => {
    for (const role of ['MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM', 'ANYTHING_ELSE']) {
      const access = new Access({ role, archived: false, granted: [...permissions] });
      expect(permissions.some((permission) => access.holds(permission))).toBe(false);
    }
  });

  it('an archived person holds none: an admin too', () => {
    expect(new Access({ ...dana, archived: true }).holds('VOID')).toBe(false);
    expect(new Access({ ...luis, archived: true }).holds('VOID')).toBe(false);
  });
});

describe('who may call an endpoint', () => {
  it('AC-10-27 one open to admins is open to an admin and to nobody else', () => {
    expect(
      roles.map((role) => new Access({ ...luis, role }).allowed({ roles: ['ADMIN'] })),
    ).toEqual([true, false, false, false, false]);
  });

  it('AC-10-27 one that takes a permission is open to an admin, and to a manager/analyst only with it', () => {
    const asked = { roles: backOffice, permission: 'VOID' } as const;
    expect(new Access(dana).allowed(asked)).toBe(true);
    expect(new Access(luis).allowed(asked)).toBe(true);
    expect(new Access(luis).allowed({ ...asked, permission: 'UNLOCK_INVOICED' })).toBe(false);
    expect(new Access({ ...luis, granted: [] }).allowed(asked)).toBe(false);
    expect(new Access(ana).allowed(asked)).toBe(false);
    expect(new Access(viewer).allowed(asked)).toBe(false);
  });

  it('a permission never opens an endpoint to a role it doesn’t name', () => {
    expect(new Access(luis).allowed({ roles: ['ADMIN'], permission: 'VOID' })).toBe(false);
    expect(
      new Access({ ...viewer, granted: ['VOID'] }).allowed({
        roles: ['READ_ONLY_VIEWER'],
        permission: 'VOID',
      }),
    ).toBe(false);
  });

  it('one that names no role is open to nobody, and nothing is open to an archived person', () => {
    expect(new Access(dana).allowed({ roles: [] })).toBe(false);
    expect(new Access({ ...dana, archived: true }).allowed({ roles: ['ADMIN'] })).toBe(false);
  });
});

describe('the firm’s people', () => {
  const rules = new PeopleRules();

  it('AC-02-08 an admin, a manager/analyst and a read-only viewer are created in the back office; a monitor and the system actor never', () => {
    expect(backOfficeCreated).toEqual(['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER']);
    expect(roles.map((role) => rules.createdHere(role))).toEqual([true, true, false, true, false]);
  });

  it('AC-02-13 nobody gives a permission they don’t hold: only an admin gives one, and Luis can’t give even the ones he holds', () => {
    const to = { role: 'MANAGER_ANALYST', archived: false };
    for (const permission of permissions) {
      expect(rules.grantRefusal(dana, to, permission)).toBeNull();
      expect(rules.grantRefusal(luis, to, permission)).toBe('NOT_ALLOWED');
      expect(rules.grantRefusal(viewer, to, permission)).toBe('NOT_ALLOWED');
      expect(rules.grantRefusal({ ...dana, archived: true }, to, permission)).toBe('NOT_ALLOWED');
    }
  });

  it('a permission is given to a manager/analyst only, and never to an archived one', () => {
    for (const role of ['ADMIN', 'MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM']) {
      expect(rules.grantRefusal(dana, { role, archived: false }, 'VOID')).toBe(
        'NOT_A_MANAGER_ANALYST',
      );
    }
    expect(rules.grantRefusal(dana, { role: 'MANAGER_ANALYST', archived: true }, 'VOID')).toBe(
      'NOT_A_MANAGER_ANALYST',
    );
  });

  it('a project is given to a read-only viewer only, by an admin only', () => {
    expect(rules.viewerProjectRefusal(dana, viewer)).toBeNull();
    expect(rules.viewerProjectRefusal(luis, viewer)).toBe('NOT_ALLOWED');
    expect(rules.viewerProjectRefusal(dana, luis)).toBe('NOT_A_VIEWER');
    expect(rules.viewerProjectRefusal(dana, { ...viewer, archived: true })).toBe('NOT_A_VIEWER');
  });

  it('AC-02-13 the last admin stays: the only admin in service can’t be taken out, one of two can', () => {
    expect(rules.lastAdmin(dana, 0)).toBe(true);
    expect(rules.lastAdmin(dana, 1)).toBe(false);
    expect(rules.lastAdmin(luis, 0)).toBe(false);
    expect(rules.lastAdmin({ ...dana, archived: true }, 0)).toBe(false);
  });

  it('AC-02-72 a monitor’s phone number is read by an admin, never by a manager/analyst; no viewer reads anybody’s', () => {
    expect(rules.readsPhoneOf(dana, 'MONITOR')).toBe(true);
    expect(rules.readsPhoneOf(luis, 'MONITOR')).toBe(false);
    expect(rules.readsPhoneOf(luis, 'MANAGER_ANALYST')).toBe(true);
    expect(rules.readsPhoneOf(luis, 'READ_ONLY_VIEWER')).toBe(true);
    for (const role of roles) {
      expect(rules.readsPhoneOf(viewer, role)).toBe(false);
      expect(rules.readsPhoneOf(ana, role)).toBe(false);
      expect(rules.readsPhoneOf({ ...dana, archived: true }, role)).toBe(false);
    }
  });
});
