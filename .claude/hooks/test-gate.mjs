#!/usr/bin/env node
// Stop hook: soft "test after feature" gate. Node port of the harness test-gate.sh,
// so it needs no jq on Windows. Only logic paths (api/, public/js/logic/) are gated:
// camera and visuals stay free.
// Fail-open on any error. Loop-safe: caps at 2 blocks per git HEAD, then gives up.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATED = /^(api|public[\\/]js[\\/]logic)[\\/].+\.(js|mjs|ts)$/i;
const TEST_RUN = /npm (run )?test|node --test|vitest/i;
const MAX_BLOCKS = 2;

function toolUses(transcriptPath) {
  const uses = [];
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'assistant' || !Array.isArray(entry.message?.content)) continue;
    uses.push(...entry.message.content.filter((block) => block.type === 'tool_use'));
  }
  return uses;
}

function hasTestScript() {
  const pkgPath = join(ROOT, 'package.json');
  if (!existsSync(pkgPath)) return false;
  return Boolean(JSON.parse(readFileSync(pkgPath, 'utf8')).scripts?.test);
}

function gitHead() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'no-git';
  }
}

function underBlockCap(sessionId) {
  const dir = join(ROOT, '.claude', 'sessions');
  mkdirSync(dir, { recursive: true });
  const counter = join(dir, `${sessionId}.testcount`);
  const head = gitHead();
  const [prevHead, prevCount] = existsSync(counter)
    ? readFileSync(counter, 'utf8').trim().split(' ')
    : [];
  const count = prevHead === head ? Number(prevCount) || 0 : 0;
  if (count >= MAX_BLOCKS) return false;
  writeFileSync(counter, `${head} ${count + 1}\n`);
  return true;
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (input.stop_hook_active || !input.session_id || !input.transcript_path) return;
  if (!existsSync(input.transcript_path)) return;

  const uses = toolUses(input.transcript_path);
  const edited = uses
    .filter((use) => ['Edit', 'Write', 'MultiEdit'].includes(use.name))
    .map((use) => relative(ROOT, resolve(ROOT, use.input?.file_path ?? '')))
    .find((file) => GATED.test(file));
  if (!edited || !hasTestScript()) return;

  const ranTests = uses.some(
    (use) => ['Bash', 'PowerShell'].includes(use.name) && TEST_RUN.test(use.input?.command ?? ''),
  );
  if (ranTests || !underBlockCap(input.session_id)) return;

  const reason = `You edited logic (\`${edited}\`) but ran no tests this session. Run \`npm test\` and cite the real output before declaring done. If a test genuinely can't run here, say why.`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

try {
  main();
} catch {
  // Fail-open: a broken gate must never trap the session.
}
