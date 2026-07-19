import { describe, expect, it } from 'vitest';
import { hasPermission, resolvePermissions } from './permissions.js';

describe('hasPermission', () => {
  it('grants on exact match', () => {
    expect(hasPermission(['branch.view'], 'branch.view')).toBe(true);
  });
  it('denies on missing permission', () => {
    expect(hasPermission(['branch.view'], 'branch.manage')).toBe(false);
  });
  it('grants on global wildcard', () => {
    expect(hasPermission(['*'], 'anything.at_all')).toBe(true);
  });
  it('grants on module wildcard', () => {
    expect(hasPermission(['session.*'], 'session.manage')).toBe(true);
    expect(hasPermission(['session.*'], 'branch.view')).toBe(false);
  });
});

describe('resolvePermissions', () => {
  it('tenant_admin gets *', () => {
    expect(resolvePermissions('tenant_admin')).toContain('*');
  });
  it('overrides are additive and deduped', () => {
    const perms = resolvePermissions('teacher', ['branch.view', 'audit.view']);
    expect(perms).toContain('audit.view');
    expect(perms.filter((p) => p === 'branch.view')).toHaveLength(1);
  });
  it('student starts with nothing', () => {
    expect(resolvePermissions('student')).toEqual([]);
  });
});
