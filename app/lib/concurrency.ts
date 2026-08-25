// A tiny in-process semaphore so bursts of AI work don't all fire at once and trip
// Anthropic's per-minute rate limits. Excess callers queue and run as slots free up.
// Per server instance (not cross-instance) — pair with a tier bump for hard ceilings.

class Semaphore {
 private active = 0;
 private queue: Array<() => void> = [];
 // Written out longhand rather than as a constructor parameter property: Node's built-in TS
 // support is strip-only, and a parameter property makes every module that transitively imports
 // this one unloadable under `node --test` — which is the whole test suite for the pricing path.
 private max: number;
 constructor(max: number) { this.max = max; }

 async run<T>(fn: () => Promise<T>): Promise<T> {
 if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
 this.active++;
 try {
 return await fn();
 } finally {
 this.active--;
 this.queue.shift()?.();
 }
 }
}

const gates = new Map<string, Semaphore>();

/** Get (or create) a named concurrency gate. Same key → same shared limiter. */
export function gate(key: string, max: number): Semaphore {
 let s = gates.get(key);
 if (!s) { s = new Semaphore(Math.max(1, max)); gates.set(key, s); }
 return s;
}
