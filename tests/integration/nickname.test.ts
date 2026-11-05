import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { user, userNickname } from "@/db/schema";
import { listUsers } from "@/lib/admin-users";
import { nicknameKey } from "@/lib/nickname";
import { clearNickname, getNickname, saveNickname } from "@/lib/nickname-store";

/**
 * The nickname against a real Postgres: one user per key, whatever the case,
 * two users racing for one name, and the cascade from the account.
 *
 * decisions/077-nickname.md
 */

const FIRST = "itest-nickname-first";
const SECOND = "itest-nickname-second";
const USERS = [FIRST, SECOND];

/** Polls until a query of this database is waiting on a lock, so a race is set up, not hoped for. */
async function waitForABlockedQuery() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [row] = await db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'`
    );
    if ((row?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("No query started waiting on a lock");
}

function stored(nickname: string) {
  return { nickname, key: nicknameKey(nickname) };
}

beforeEach(async () => {
  await db.insert(user).values(
    USERS.map((id) => ({
      id,
      name: "Integration Reader",
      email: `${id}@example.com`,
      emailVerified: true,
    }))
  );
});

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, USERS));
});

describe("nickname storage", () => {
  it("sets, changes and removes a user's nickname", async () => {
    expect(await saveNickname(FIRST, stored("Kalle"))).toBe("set");
    expect(await getNickname(FIRST)).toBe("Kalle");

    expect(await saveNickname(FIRST, stored("Kalle Kukko"))).toBe("changed");
    expect(await getNickname(FIRST)).toBe("Kalle Kukko");

    expect(await saveNickname(FIRST, null)).toBe("removed");
    expect(await getNickname(FIRST)).toBeNull();
  });

  it("refuses a name another user holds in any case, and keeps the loser's own", async () => {
    await saveNickname(FIRST, stored("Äijä"));
    await saveNickname(SECOND, stored("Toinen"));

    expect(await saveNickname(SECOND, stored("äIJÄ"))).toBe("taken");
    // The delete before the insert was undone with it.
    expect(await getNickname(SECOND)).toBe("Toinen");
    expect(await getNickname(FIRST)).toBe("Äijä");
  });

  it("lets a user change the case of their own nickname", async () => {
    await saveNickname(FIRST, stored("kalle"));

    expect(await saveNickname(FIRST, stored("KALLE"))).toBe("changed");
    expect(await getNickname(FIRST)).toBe("KALLE");
  });

  it("gives a name to exactly one of two users saving it at once", async () => {
    const outcomes = await Promise.all([
      saveNickname(FIRST, stored("Sama Nimi")),
      saveNickname(SECOND, stored("sama nimi")),
    ]);

    expect(outcomes.toSorted()).toEqual(["set", "taken"]);
    const rows = await db
      .select()
      .from(userNickname)
      .where(eq(userNickname.nicknameKey, "sama nimi"));
    expect(rows).toHaveLength(1);
  });

  it("makes a save wait for the same user's save in flight, then replace it", async () => {
    await saveNickname(FIRST, stored("Ennen"));
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let written: () => void = () => {};
    const midSave = new Promise<void>((resolve) => {
      written = resolve;
    });
    // Another save of the same user's, stopped after its write, before its commit.
    const first = db.transaction(async (tx) => {
      await tx.select({ id: user.id }).from(user).where(eq(user.id, FIRST)).for("no key update");
      await tx.delete(userNickname).where(eq(userNickname.userId, FIRST));
      await tx.insert(userNickname).values({ userId: FIRST, nickname: "Eka", nicknameKey: "eka" });
      written();
      await held;
    });
    await midSave;

    const second = saveNickname(FIRST, stored("Toka"));
    await waitForABlockedQuery();
    release();
    await first;

    expect(await second).toBe("changed");
    expect(await getNickname(FIRST)).toBe("Toka");
  });

  it("frees a name once it is cleared", async () => {
    await saveNickname(FIRST, stored("Vapaa"));
    await clearNickname(FIRST);

    expect(await getNickname(FIRST)).toBeNull();
    expect(await saveNickname(SECOND, stored("Vapaa"))).toBe("set");
  });

  it("goes with the account, and frees the name", async () => {
    await saveNickname(FIRST, stored("Poistuva"));
    await db.delete(user).where(eq(user.id, FIRST));

    const rows = await db.select().from(userNickname).where(eq(userNickname.userId, FIRST));
    expect(rows).toHaveLength(0);
    expect(await saveNickname(SECOND, stored("Poistuva"))).toBe("set");
  });

  it("reaches the admin's user list, and none for a user without", async () => {
    await saveNickname(FIRST, stored("Listattu"));

    const { pages } = await listUsers(1);
    const listed = [];
    for (let page = 1; page <= pages; page += 1) {
      listed.push(...(await listUsers(page)).users);
    }
    const ours = listed.filter((entry) => USERS.includes(entry.id));
    expect(Object.fromEntries(ours.map((entry) => [entry.id, entry.nickname]))).toEqual({
      [FIRST]: "Listattu",
      [SECOND]: null,
    });
  });
});
