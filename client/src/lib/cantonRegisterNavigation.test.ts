import { describe, expect, it } from 'vitest';
import { cantonRegisterRoute } from './cantonRegisterNavigation';

describe('canton register navigation', () => {
  it('separates the destination route from section scrolling in hosted and file editions', () => {
    for (const id of ['basel-stadt', 'basel-landschaft'] as const) {
      const route = cantonRegisterRoute(id);
      expect(route).toBe(`/canton/${id}`);
      expect(route).not.toContain('#');
      expect(route).not.toContain('?');
    }
  });
});
