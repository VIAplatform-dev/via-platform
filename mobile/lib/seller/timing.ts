// How long the listing pipeline actually takes, per phase.
//
// The Loading screen quotes a number at the seller ("usually around half a minute") and its own
// comment is emphatic that the number must be MEASURED and never lowered hopefully. There was no
// way to measure it: the run happens on her phone, on her network, on her photographs, and a
// stopwatch on a laptop against a synthetic call answers a different question.
//
// So the pipeline times itself. Development only, because it is a developer's question, and the
// numbers go to the Metro console where whoever is watching the run can read them.

/** ms → "24.7s" / "820ms". Two significant figures is as precise as this needs to be. */
export function human(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

/**
 * Run `work`, and say how long it took.
 *
 * Returns whatever the work returns, and rethrows what it throws, so it can be wrapped around an
 * existing call without changing a single thing about the flow. A phase that FAILS is timed too
 * and says so: "the pricing call hung for 90 seconds and then 500ed" is the most useful line this
 * can print, and the one a success-only timer never shows.
 */
export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (!__DEV__) return work();
  const started = Date.now();
  try {
    const out = await work();
    console.log(`[listing] ${label}: ${human(Date.now() - started)}`);
    return out;
  } catch (e) {
    console.log(`[listing] ${label}: FAILED after ${human(Date.now() - started)}`);
    throw e;
  }
}

/** A stopwatch for something that isn't one awaited call. `lap()` prints the total so far. */
export function stopwatch(label: string): { lap: (note: string) => void } {
  const started = Date.now();
  return {
    lap: (note: string) => {
      if (__DEV__) console.log(`[listing] ${label} · ${note}: ${human(Date.now() - started)}`);
    },
  };
}
