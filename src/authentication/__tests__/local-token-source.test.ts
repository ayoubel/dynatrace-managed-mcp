import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalTokenSource } from '../local-token-source';
import { parseManagedEnvironmentConfig } from '../../utils/environment';

jest.mock('../../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn() },
  logErrorObject: jest.fn(),
}));
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mcp-rotation-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const raw = { apiEndpointUrl: 'https://example.com', environmentId: 'env', alias: 'test', apiToken: 'original' };
  const config = join(dir, 'config.json'),
    env = join(dir, '.env');
  writeFileSync(config, JSON.stringify([{ ...raw, apiToken: '${TOKEN}' }]));
  writeFileSync(env, 'TOKEN=rotated\n');
  const source = createLocalTokenSource([parseManagedEnvironmentConfig(raw)], config, env, { TOKEN: 'original' });
  return { source, config, env, raw };
}
test('reloads edited env file without changing process environment', () => {
  const f = fixture();
  const before = process.env.TOKEN;
  expect(f.source().get('test')).toBe('rotated');
  writeFileSync(f.env, 'TOKEN=next\n');
  expect(f.source().get('test')).toBe('next');
  expect(process.env.TOKEN).toBe(before);
});
test('removed token cannot fall back to stale startup credentials', () => {
  const f = fixture();
  writeFileSync(f.env, '');
  expect(f.source).toThrow('Local credential configuration unavailable');
});
test('changing an environment endpoint requires restart', () => {
  const f = fixture();
  writeFileSync(f.config, JSON.stringify([{ ...f.raw, apiEndpointUrl: 'https://other.com' }]));
  expect(f.source).toThrow('restart');
});
test('literal config tokens rotate without an env file', () => {
  const f = fixture();
  const source = createLocalTokenSource([parseManagedEnvironmentConfig(f.raw)], f.config, undefined);
  writeFileSync(f.config, JSON.stringify([{ ...f.raw, apiToken: 'new' }]));
  expect(source().get('test')).toBe('new');
});
test('parse errors never expose credential contents', () => {
  const f = fixture();
  writeFileSync(f.config, '{secret-token');
  expect(f.source).toThrow(
    new Error('Local credential configuration unavailable or changed; restore it or restart after environment changes'),
  );
});
test('newly referenced file credentials never fall back after removal', () => {
  const f = fixture();
  const source = createLocalTokenSource([parseManagedEnvironmentConfig(f.raw)], f.config, f.env, {
    TOKEN: 'original',
    NEW_TOKEN: 'stale-process-value',
  });
  writeFileSync(f.config, JSON.stringify([{ ...f.raw, apiToken: '${NEW_TOKEN}' }]));
  writeFileSync(f.env, 'NEW_TOKEN=new-file-value\n');
  expect(source().get('test')).toBe('new-file-value');
  writeFileSync(f.env, '');
  expect(source).toThrow('Local credential configuration unavailable');
});
test('tilde and variable paths use the same resolver as startup configuration', () => {
  const f = fixture();
  const source = createLocalTokenSource([parseManagedEnvironmentConfig(f.raw)], '~/config.json', '${TEST_DIR}/.env', {
    HOME: dir,
    TEST_DIR: dir,
    TOKEN: 'original',
  });
  expect(source().get('test')).toBe('rotated');
});
