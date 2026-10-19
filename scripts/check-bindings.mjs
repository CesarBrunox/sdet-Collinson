#!/usr/bin/env node
/**
 * Full-suite dry run that FAILS on undefined, ambiguous or pending steps.
 * (Cucumber's --dry-run reports undefined steps but still exits 0, so we inspect its JSON.)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

mkdirSync(path.join('reports', 'bindings'), { recursive: true });
const report = path.join('reports', 'bindings', 'dry-run.json');
const cucumber = path.join('node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
const run = spawnSync(
  process.execPath,
  [cucumber, '-p', 'all', '--dry-run', '--format', `json:${report}`, '--format', 'summary'],
  {
    stdio: 'inherit',
  },
);

const scenarios = JSON.parse(readFileSync(report, 'utf8')).flatMap((f) =>
  f.elements.filter((e) => e.type === 'scenario').map((e) => ({ ...e, uri: f.uri })),
);
const bad = scenarios.flatMap((s) =>
  s.steps
    .filter((st) => ['undefined', 'ambiguous', 'pending'].includes(st.result.status))
    .map((st) => `${st.result.status.toUpperCase()}: ${s.uri}:${st.line} ${st.keyword}${st.name}`),
);
const steps = scenarios.reduce((n, s) => n + s.steps.filter((st) => !st.hidden).length, 0);
if (run.status !== 0 || bad.length) {
  console.error(`\nBinding check FAILED (${bad.length} problem(s)):\n${bad.join('\n')}`);
  process.exit(1);
}
console.log(`\nBinding check passed: ${scenarios.length} scenarios, ${steps} steps, all bound.`);
