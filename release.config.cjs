/**
 * semantic-release config — wired but intentionally NOT run in CI.
 *
 * The release workflow is committed for portfolio purposes; nothing is actually
 * published to npm. Run `pnpm run release:dry` to see what the next release would
 * look like without touching the registry.
 */
module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'docs', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'build', release: 'patch' },
          { type: 'ci', release: false },
          { type: 'chore', release: false },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: 'Features' },
            { type: 'fix', section: 'Bug Fixes' },
            { type: 'perf', section: 'Performance' },
            { type: 'refactor', section: 'Refactors' },
            { type: 'docs', section: 'Documentation' },
            { type: 'build', section: 'Build' },
            { type: 'chore', hidden: true },
            { type: 'ci', hidden: true },
            { type: 'test', hidden: true },
            { type: 'style', hidden: true },
          ],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/npm',
      {
        // npmPublish disabled — this repo is a portfolio piece; we don't actually
        // push to the public registry. Flip to `true` to enable.
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};
