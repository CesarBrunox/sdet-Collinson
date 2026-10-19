#!/usr/bin/env node
/**
 * Red-state verification for the spec-first suite (no system under test required).
 *
 *   node scripts/verify-red-state.mjs absent   # nothing listens on API_BASE_URL
 *   node scripts/verify-red-state.mjs html     # an unrelated service answers 200 text/html
 *
 * absent: every spec scenario must FAIL (not pass, not skip), all Given steps must pass, and
 *         the first failing step must be an action step failing with CONNECTION_REFUSED.
 *         This separates "the API is not built yet" from "the automation is broken".
 * html:   no spec scenario may PASS when an unrelated HTML service answers every request, and
 *         every scenario must fail for the expected reason: its first failing step reports
 *         [NON_JSON_RESPONSE] (the content-type/JSON gate), not a status, contract or
 *         transport problem.
 *
 * The target is a port confirmed free at start-up (never 3000 by assumption, and no running
 * service is touched). Exit code 0 = the red state is the expected one. Results go to
 * reports/red-state/<mode>.json and reports/red-state/<mode>.md (also appended to the
 * GitHub step summary when available).
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const mode = process.argv[2];
if (!['absent', 'html'].includes(mode)) {
  console.error('usage: verify-red-state.mjs <absent|html>');
  process.exit(2);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let htmlServer;
const port = await freePort();
if (mode === 'html') {
  htmlServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><title>Unrelated app</title></head><body>Sign in</body></html>');
  });
  await new Promise((r) => htmlServer.listen(port, '127.0.0.1', r));
}

const target = `http://127.0.0.1:${port}`;
mkdirSync(path.join('reports', 'red-state'), { recursive: true });
const jsonReport = path.join('reports', 'red-state', `${mode}.json`);
const cucumber = path.join('node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');
console.log(`[verify:${mode}] running spec suite against ${target}`);
// Async spawn: the HTML stand-in runs in THIS process and must keep serving meanwhile.
const run = await new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    [
      cucumber,
      '--tags',
      'not @harness and not @live',
      '--format',
      `json:${jsonReport}`,
      '--format',
      'summary',
    ],
    { env: { ...process.env, API_BASE_URL: target }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stdout = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stdout += d));
  child.on('close', (status) => resolve({ status, stdout }));
});
htmlServer?.close();
htmlServer?.closeAllConnections();

const features = JSON.parse(readFileSync(jsonReport, 'utf8'));
const scenarios = features.flatMap((f) =>
  f.elements.filter((e) => e.type === 'scenario').map((e) => ({ ...e, feature: f.uri })),
);
const problems = [];
let passed = 0;
let failedAsExpected = 0;

for (const s of scenarios) {
  const steps = s.steps.filter((st) => !st.hidden);
  const statuses = steps.map((st) => st.result.status);
  const name = `${s.feature}:${s.line} ${s.name}`;
  if (statuses.every((x) => x === 'passed')) {
    passed++;
    problems.push(`PASSED (must fail): ${name}`);
    continue;
  }
  const firstBad = steps.findIndex((st) => st.result.status !== 'passed');
  const step = steps[firstBad];
  if (mode === 'html') {
    const msg = step.result.error_message ?? '';
    if (step.result.status !== 'failed')
      problems.push(`${step.result.status.toUpperCase()} step "${step.name}": ${name}`);
    else if (!msg.includes('[NON_JSON_RESPONSE]'))
      problems.push(
        `unexpected failure category (want NON_JSON_RESPONSE): ${name}\n      ${msg.split('\n')[0]}`,
      );
    else failedAsExpected++;
    continue;
  }
  const isAction = (step.match?.location ?? '').includes('act.steps');
  const msg = step.result.error_message ?? '';
  if (step.result.status !== 'failed')
    problems.push(`${step.result.status.toUpperCase()} step "${step.name}": ${name}`);
  else if (!isAction) problems.push(`failed outside an action step ("${step.keyword}${step.name}"): ${name}`);
  else if (!msg.includes('CONNECTION_REFUSED'))
    problems.push(`unexpected failure category: ${name}\n      ${msg.split('\n')[0]}`);
  else failedAsExpected++;
}

const ok = scenarios.length > 0 && problems.length === 0 && run.status !== 0;
const lines = [
  `## Red-state verification (${mode})`,
  '',
  `- Target: \`${target}\` (${mode === 'absent' ? 'nothing listening' : 'unrelated HTML service'})`,
  `- Spec scenarios: ${scenarios.length}; passed: ${passed}; ` +
    (mode === 'absent'
      ? `failed at an action step with CONNECTION_REFUSED: ${failedAsExpected}`
      : `failed at the JSON gate with NON_JSON_RESPONSE: ${failedAsExpected}`),
  `- Cucumber exit code: ${run.status} (non-zero expected)`,
  `- Outcome: **${ok ? 'EXPECTED RED STATE' : 'UNEXPECTED: investigate the automation'}**`,
  ...(problems.length ? ['', 'Problems:', ...problems.slice(0, 50).map((p) => `- ${p}`)] : []),
  '',
];
const md = lines.join('\n');
writeFileSync(path.join('reports', 'red-state', `${mode}.md`), md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log((run.stdout ?? '').split('\n').slice(-4).join('\n'));
console.log(md);
process.exit(ok ? 0 : 1);
