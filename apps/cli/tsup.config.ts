import { defineConfig } from 'tsup'
import path from 'path'

const packagesDir = path.resolve(__dirname, '../../packages')

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  noExternal: [/^@broker\//],
  external: ['commander', 'yaml', 'zod', '@modelcontextprotocol/sdk'],
  esbuildOptions(options) {
    options.alias = {
      '@broker/local-runtime': path.join(packagesDir, 'local-runtime/src/index.ts'),
      '@broker/connectors': path.join(packagesDir, 'connectors/src/index.ts'),
      '@broker/crypto': path.join(packagesDir, 'crypto/src/index.ts'),
      '@broker/shared-types': path.join(packagesDir, 'shared-types/src/index.ts'),
    }
  },
})
