import { permittedTool } from '../tools/token-tool-access';

interface ScopeClient {
  alias: string;
  getTokenScopes(token: string): Promise<string[]>;
}

/** One serialized credential snapshot for both discovery and execution. No persistent token cache. */
export class TokenToolPolicy {
  private scopes: string[][] = [];
  private validatedTokens = new Map<string, string>();
  private checkedAt = -Infinity;
  private available = false;
  private queue: Promise<unknown> = Promise.resolve();
  private listener: () => void = () => {};
  private timer?: ReturnType<typeof setInterval>;
  private pollPending = false;

  constructor(
    private readonly clients: ScopeClient[],
    private readonly source: () => Map<string, string>,
    private readonly activeTokens: Map<string, string>,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  onChange(listener: () => void): void {
    this.listener = listener;
  }

  permitted(name: string, readOnly: boolean | undefined): boolean {
    return this.available && permittedTool(name, readOnly, this.scopes);
  }

  scopesFor(alias: string): string[] | undefined {
    const index = this.clients.findIndex((client) => client.alias === alias);
    return this.available && index >= 0 ? [...this.scopes[index]] : undefined;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  refresh(): Promise<void> {
    return this.serial(() => this.refreshUnlocked());
  }

  private async refreshUnlocked(): Promise<void> {
    try {
      const candidates = this.source();
      const unchanged =
        candidates.size === this.validatedTokens.size &&
        [...candidates].every(([alias, token]) => this.validatedTokens.get(alias) === token);
      if (unchanged && this.available && this.now() - this.checkedAt < this.ttlMs) return;
      // Validate all environments before publishing a new snapshot.
      const scopes = await Promise.all(
        this.clients.map((client) => {
          const token = candidates.get(client.alias);
          if (!token) throw new Error('Missing token');
          return client.getTokenScopes(token);
        }),
      );
      if (!scopes.length) throw new Error('No environments');
      this.activeTokens.clear();
      for (const [alias, token] of candidates) this.activeTokens.set(alias, token);
      this.validatedTokens = candidates;
      this.scopes = scopes;
      this.checkedAt = this.now();
      this.available = true;
      this.listener();
    } catch {
      this.activeTokens.clear();
      this.scopes = [];
      this.available = false;
      this.listener();
      throw new Error('Credential refresh failed; tools are disabled until credentials validate');
    }
  }

  /** Serializing execution prevents a poll from rotating tokens midway through a multi-step write. */
  execute<T>(name: string, readOnly: boolean | undefined, operation: () => Promise<T>): Promise<T> {
    return this.serial(async () => {
      await this.refreshUnlocked();
      if (!this.permitted(name, readOnly)) throw new Error('Tool unavailable for the current token permissions');
      return operation();
    });
  }

  start(pollMs = 5_000, onFailure: () => void = () => {}): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.pollPending) return;
      this.pollPending = true;
      void this.refresh()
        .catch(onFailure)
        .finally(() => {
          this.pollPending = false;
        });
    }, pollMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
