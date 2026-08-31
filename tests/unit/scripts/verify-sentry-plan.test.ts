import { describe, expect, it } from "vitest";
import {
  buildMarker,
  describeDsn,
  describeOutcome,
  describeSettings,
} from "../../../scripts/verify-sentry-plan";

describe("describeDsn", () => {
  it("keeps the host and project id, which say where the event went", () => {
    expect(
      describeDsn("https://abc123@o4511499874729984.ingest.de.sentry.io/4511977968959568")
    ).toBe("o4511499874729984.ingest.de.sentry.io/4511977968959568");
  });

  // The public key is a credential, and this output is meant to be pasted into
  // an issue or a chat when someone asks "did it work?".
  it("never echoes the public key", () => {
    expect(describeDsn("https://sup3rs3cret@o1.ingest.sentry.io/2")).not.toContain("sup3rs3cret");
  });

  it.each([
    ["not a url", "nonsense"],
    ["a DSN with no key", "https://o1.ingest.sentry.io/2"],
    ["a DSN with no project id", "https://abc@o1.ingest.sentry.io"],
    ["an empty string", ""],
  ])("returns null for %s, rather than echoing something unrecognised", (_label, dsn) => {
    expect(describeDsn(dsn)).toBeNull();
  });
});

describe("buildMarker", () => {
  it("carries the moment, so two runs are told apart", () => {
    expect(buildMarker(new Date("2026-08-31T09:00:00.000Z"))).toBe(
      "footy-trends verification 2026-08-31T09:00:00.000Z"
    );
  });

  it("is distinctive enough not to collide with a real error", () => {
    expect(buildMarker(new Date())).toContain("footy-trends verification");
  });
});

describe("describeSettings", () => {
  it("shows the three values the server runtime would use", () => {
    expect(
      describeSettings({ tracesSampleRate: 0.1, sendDefaultPii: false, enableLogs: false })
    ).toBe("tracesSampleRate=0.1  sendDefaultPii=false  enableLogs=false");
  });
});

describe("describeOutcome", () => {
  const marker = "footy-trends verification 2026-08-31T09:00:00.000Z";

  it("names the variable to set when there is no DSN", () => {
    expect(describeOutcome({ kind: "no-dsn" }, marker)).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("says nothing was sent when the SDK returned no event id", () => {
    expect(describeOutcome({ kind: "not-sent" }, marker)).toContain("nothing was sent");
  });

  it("points at the network when an event queued but did not flush", () => {
    const message = describeOutcome({ kind: "not-flushed", eventId: "abc" }, marker);
    expect(message).toContain("abc");
    expect(message).toContain("did not flush");
  });

  // The claim has to stop where the evidence stops: reaching ingest is not the
  // same as being visible, and overstating it is how a green run hides a
  // project-side filter.
  it("does not claim a flushed event is visible, and sends the reader to look", () => {
    const message = describeOutcome({ kind: "sent", eventId: "abc" }, marker);
    expect(message).toContain("accepted and flushed");
    expect(message).toContain("does not prove the event is visible");
    expect(message).toContain(marker);
  });
});
