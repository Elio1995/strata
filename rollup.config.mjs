import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
);

const banner = `/**
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * (c) ${new Date().getFullYear()} ${pkg.author.name} — MIT License
 */`;

const tsPlugin = ({ outDir }) =>
  typescript({
    tsconfig: './tsconfig.build.json',
    declaration: false,
    declarationMap: false,
    outDir,
    rootDir: 'src',
    exclude: ['**/*.test.ts', 'tests/**', 'demo/**'],
  });

export default [
  // ESM + CJS — for npm consumers (bundlers, Node).
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.mjs',
        format: 'es',
        sourcemap: true,
        banner,
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
        banner,
        exports: 'named',
      },
    ],
    plugins: [resolve({ extensions: ['.ts', '.js'] }), tsPlugin({ outDir: 'dist' })],
    external: [],
  },
  // UMD — for browser <script> tag consumers via unpkg / jsdelivr.
  {
    input: 'src/index.ts',
    output: {
      file: 'umd/strata.js',
      format: 'umd',
      name: 'Strata',
      sourcemap: true,
      banner,
      exports: 'named',
    },
    plugins: [resolve({ extensions: ['.ts', '.js'] }), tsPlugin({ outDir: 'umd' }), terser()],
    external: [],
  },
  // Bundled .d.ts — single types entry for editor tooling.
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts({ tsconfig: './tsconfig.build.json' })],
  },
];
