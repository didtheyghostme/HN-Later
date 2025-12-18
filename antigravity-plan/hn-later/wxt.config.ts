import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'HN Later',
    description: 'Save Hacker News stories to read later with comment tracking',
    permissions: ['storage'],
    host_permissions: ['*://*.ycombinator.com/*'],
  },
  runner: {
    disabled: true,
  }
});
