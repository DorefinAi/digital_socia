// Times the steps of one action for devtools (console.debug, under one tag), e.g. "[copy-posted]".
// Each lap logs the step's own time and the running total, in milliseconds; `done` logs the total.

export interface StepTimer {
  /** Logs the time since the previous lap (or the start) under `step`; returns that time in ms */
  lap: (step: string) => number;
  /** Logs the total since the start; returns it in ms */
  done: (outcome?: string) => number;
  /** Times a promise as one step, logged when it settles (either way) */
  time: <T>(step: string, work: Promise<T>) => Promise<T>;
}

type Log = (tag: string, message: string) => void;

const defaultNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const defaultLog: Log = (tag, message) => console.debug(tag, message);

export function stepTimer(tag: string, now: () => number = defaultNow, log: Log = defaultLog): StepTimer {
  const start = now();
  let last = start;
  const ms = (n: number) => `${Math.round(n)} ms`;
  return {
    lap(step) {
      const t = now();
      const took = t - last;
      last = t;
      log(tag, `${step}: ${ms(took)} (at ${ms(t - start)})`);
      return took;
    },
    done(outcome = "done") {
      const total = now() - start;
      log(tag, `${outcome}: total ${ms(total)}`);
      return total;
    },
    time(step, work) {
      const from = now();
      const report = (how: string) => log(tag, `${step}${how}: ${ms(now() - from)} (at ${ms(now() - start)})`);
      return work.then(
        (v) => {
          report("");
          return v;
        },
        (err) => {
          report(" (failed)");
          throw err;
        },
      );
    },
  };
}
