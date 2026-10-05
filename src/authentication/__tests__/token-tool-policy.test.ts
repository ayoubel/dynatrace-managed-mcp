import { TokenToolPolicy } from '../token-tool-policy';

const read = 'dynatrace_managed_list_problems';
const update = 'dynatrace_managed_update_dashboard';
function fixture() {
  let candidate = 'first';
  let time = 0;
  const active = new Map<string, string>();
  const lookup = jest.fn().mockResolvedValue(['problems.read']);
  const policy = new TokenToolPolicy(
    [{ alias: 'test', getTokenScopes: lookup }],
    () => new Map([['test', candidate]]),
    active,
    60_000,
    () => time,
  );
  return {
    policy,
    active,
    lookup,
    setToken: (value: string) => {
      candidate = value;
    },
    advance: () => {
      time += 60_001;
    },
  };
}
test('unchanged credentials reuse scopes, TTL expiry refreshes them', async () => {
  const f = fixture();
  await f.policy.refresh();
  await f.policy.refresh();
  expect(f.lookup).toHaveBeenCalledTimes(1);
  expect(f.policy.permitted(read, true)).toBe(true);
  f.advance();
  await f.policy.refresh();
  expect(f.lookup).toHaveBeenCalledTimes(2);
});
test('token rotation validates and atomically updates credentials and permissions', async () => {
  const f = fixture();
  await f.policy.refresh();
  f.setToken('second');
  f.lookup.mockResolvedValueOnce(['ReadConfig', 'WriteConfig']);
  await f.policy.refresh();
  expect(f.active.get('test')).toBe('second');
  expect(f.policy.permitted(read, true)).toBe(false);
  expect(f.policy.permitted(update, false)).toBe(true);
});
test('same-token scope downgrade is detected when cache expires', async () => {
  const f = fixture();
  await f.policy.refresh();
  f.lookup.mockResolvedValueOnce([]);
  f.advance();
  await f.policy.refresh();
  expect(f.policy.permitted(read, true)).toBe(false);
});
test('failed new token clears old credentials and recovers after validation', async () => {
  const f = fixture();
  await f.policy.refresh();
  f.setToken('invalid');
  f.lookup.mockRejectedValueOnce(new Error('secret-token-body'));
  await expect(f.policy.refresh()).rejects.toThrow('Credential refresh failed');
  expect(f.active.size).toBe(0);
  expect(f.policy.permitted(read, true)).toBe(false);
  await f.policy.refresh();
  expect(f.active.get('test')).toBe('invalid');
});
test('execution checks permissions again before invoking callback', async () => {
  const f = fixture();
  await f.policy.refresh();
  const callback = jest.fn();
  f.setToken('limited');
  f.lookup.mockResolvedValueOnce([]);
  await expect(f.policy.execute(read, true, callback)).rejects.toThrow('current token permissions');
  expect(callback).not.toHaveBeenCalled();
});
test('credential snapshots cannot change midway through a multi-step operation', async () => {
  const f = fixture();
  await f.policy.refresh();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  const call = f.policy.execute(read, true, async () => {
    started();
    await gate;
    expect(f.active.get('test')).toBe('first');
  });
  await start;
  f.setToken('second');
  const refresh = f.policy.refresh();
  release();
  await call;
  await refresh;
  expect(f.active.get('test')).toBe('second');
});
test('one invalid environment fails the whole intersection closed', async () => {
  const active = new Map([['a', 'old']]);
  const policy = new TokenToolPolicy(
    [
      { alias: 'a', getTokenScopes: async () => ['problems.read'] },
      {
        alias: 'b',
        getTokenScopes: async () => {
          throw new Error('invalid');
        },
      },
    ],
    () =>
      new Map([
        ['a', 'one'],
        ['b', 'two'],
      ]),
    active,
  );
  await expect(policy.refresh()).rejects.toThrow('Credential refresh failed');
  expect(active.size).toBe(0);
});
test('deleted credential source blocks execution and clears active credentials', async () => {
  const active = new Map([['test', 'old']]);
  const callback = jest.fn();
  const policy = new TokenToolPolicy(
    [{ alias: 'test', getTokenScopes: async () => [] }],
    () => {
      throw new Error('secret');
    },
    active,
  );
  await expect(policy.execute(read, true, callback)).rejects.toThrow('Credential refresh failed');
  expect(active.size).toBe(0);
  expect(callback).not.toHaveBeenCalled();
});
test('idle polling discovers a changed token without any tool requests', async () => {
  jest.useFakeTimers();
  const f = fixture();
  try {
    await f.policy.refresh();
    f.setToken('second');
    f.policy.start(5);
    await jest.advanceTimersByTimeAsync(5);
    expect(f.active.get('test')).toBe('second');
  } finally {
    f.policy.stop();
    jest.useRealTimers();
  }
});
