/**
 * Preloaded into a script a test runs as its own process: the clock starts at 12:00 UTC on a
 * fixed day and ticks from there, so the run never lands in the daily refresh's hour.
 *
 * decisions/883-real-clock-tests-and-the-daily-hour.md
 */
const RealDate = Date;
const offset = RealDate.UTC(2026, 9, 3, 12, 0, 0) - RealDate.now();
const now = () => RealDate.now() + offset;

globalThis.Date = new Proxy(RealDate, {
  construct: (target, args, newTarget) =>
    Reflect.construct(target, args.length === 0 ? [now()] : args, newTarget),
  apply: () => new RealDate(now()).toString(),
  get: (target, property, receiver) =>
    property === "now" ? now : Reflect.get(target, property, receiver),
});
