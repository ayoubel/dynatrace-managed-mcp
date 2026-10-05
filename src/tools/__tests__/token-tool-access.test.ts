import { permittedTool, toolScopes } from '../token-tool-access';
import fs from 'node:fs';
import path from 'node:path';

test('tool mappings match the pinned upstream scope documentation', () => {
  const markdown = fs.readFileSync(path.resolve(__dirname, '../../../docs/api_token_scopes.md'), 'utf8');
  const documented = new Map<string, string>();
  for (const line of markdown.split('\n')) {
    const cells = [...line.matchAll(/`([^`]+)`/g)].map(m => m[1].trim());
    if (cells.length === 3 && cells[0].startsWith('dynatrace_managed_')) documented.set(cells[0], cells[2]);
  }
  expect(toolScopes).toEqual(documented);
});
test('scope filtering denies unknown, unauthorized, and non-read-only tools', () => {
  const name = 'dynatrace_managed_list_problems';
  expect(permittedTool(name, true, [['problems.read']])).toBe(true);
  expect(permittedTool(name, true, [['entities.read']])).toBe(false);
  expect(permittedTool(name, false, [['problems.read']])).toBe(false);
  expect(permittedTool('unknown', true, [['problems.read']])).toBe(false);
  expect(permittedTool(name, true, [])).toBe(false);
  expect(permittedTool(name, true, [['problems.read'], ['entities.read']])).toBe(false);
});
