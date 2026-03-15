import { defineConfig } from 'tsup'
import path from 'path'
import { readFileSync } from 'fs'

const packagesDir = path.resolve(__dirname, '../../packages')
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  noExternal: [/^@broker\//],
  external: ['commander', 'yaml', 'zod', '@modelcontextprotocol/sdk', 'pino', 'safe-regex2'],
  define: {
    'PKG_VERSION': JSON.stringify(pkg.version),
  },
  esbuildOptions(options) {
    options.alias = {
      '@broker/local-runtime': path.join(packagesDir, 'local-runtime/src/index.ts'),
      '@broker/connectors': path.join(packagesDir, 'connectors/src/index.ts'),
      '@broker/crypto': path.join(packagesDir, 'crypto/src/index.ts'),
      '@broker/shared-types': path.join(packagesDir, 'shared-types/src/index.ts'),
      '@broker/shared-utils': path.join(packagesDir, 'shared-utils/src/index.ts'),
    }
  },
})
