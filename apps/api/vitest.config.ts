import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    globalSetup: ['test/global-setup.ts'],
    hookTimeout: 30_000,
  },
});
