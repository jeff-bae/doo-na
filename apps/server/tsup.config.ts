import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/user.ts'],
  format: 'esm',
  target: 'node22',
  platform: 'node',
  clean: true,
  // shared는 TS 소스 패키지이므로 번들에 포함
  noExternal: ['@doona/shared'],
});
