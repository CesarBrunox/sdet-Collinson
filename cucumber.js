const common = {
  requireModule: ['ts-node/register'],
  require: ['features/support/**/*.ts', 'features/step_definitions/**/*.ts'],
  paths: ['features/**/*.feature'],
  formatOptions: { snippetInterface: 'async-await' },
};

const reports = (dir) => ['summary', `html:reports/${dir}/report.html`, `json:reports/${dir}/report.json`];

module.exports = {
  // npm test: the API specification only (red until the API exists).
  default: { ...common, tags: 'not @harness and not @live', format: ['progress-bar', ...reports('spec')] },
  // npm run test:harness: self-checks of stub, validators and HTTP client (always green).
  harness: { ...common, tags: '@harness', format: reports('harness') },
  // npm run test:live: opt-in smoke test against the real Open-Meteo (needs internet).
  live: { ...common, tags: '@live', format: reports('live') },
  // Every feature; used only by the dry-run binding check.
  all: { ...common, format: ['summary'] },
};
