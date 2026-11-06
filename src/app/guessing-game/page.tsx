import type { Metadata } from "next";
import { GuessingGamePage } from "@/components/guessing-game-page";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { currentUserId } from "@/lib/current-user";
import type { Board, Shares } from "@/lib/guessing-game";
import { boardSeason, readOthers } from "@/lib/guessing-game-board";
import { type GroupSummary, readGroupsOf } from "@/lib/guessing-game-group-store";
import type { ModelGuess } from "@/lib/guessing-game-models";
import { readSeasonSectionOf, type SeasonSections } from "@/lib/guessing-game-season-store";
import { type GameView, openGame } from "@/lib/guessing-game-store";
import { logger } from "@/lib/logger";
import { getNickname } from "@/lib/nickname-store";

const HEADING = "Arvauspeli";

export const metadata: Metadata = { title: HEADING };

/**
 * Per-player, so it can never be prerendered.
 *
 * decisions/072-match-guesses.md
 */
export const dynamic = "force-dynamic";

/**
 * The reader's nickname, or `undefined` when it cannot be read: that costs the
 * page its line about choosing one, not the game.
 *
 * decisions/077-nickname.md
 */
async function nicknameOrUnknown(userId: string): Promise<string | null | undefined> {
  try {
    return await getNickname(userId);
  } catch (error) {
    logger.error({ err: error, userId }, "Reading the nickname on Arvauspeli failed");
    return undefined;
  }
}

/**
 * A joined player's groups, `"error"` when they cannot be read, which costs only
 * the section, or `null` for a reader not playing, who has none.
 *
 * decisions/078-private-groups.md
 */
async function groupsOf(view: GameView, userId: string): Promise<GroupSummary[] | "error" | null> {
  const joined = view.kind === "playing" || (view.kind !== "not-joined" && view.joined);
  if (!joined) return null;
  try {
    return await readGroupsOf(userId, boardSeason(view));
  } catch (error) {
    logger.error({ err: error, userId }, "Reading Arvauspeli groups failed");
    return "error";
  }
}

/**
 * `/arvauspeli`: a signed-in reader's way into the game, or their balance and
 * guesses, the season's leaderboard and their groups. A failed read says so,
 * never "signed out".
 *
 * decisions/072-match-guesses.md
 * decisions/077-nickname.md
 * decisions/073-leaderboard.md
 * decisions/075-season-guesses.md
 * decisions/078-private-groups.md
 */
export default async function GuessingGame() {
  let view: GameView;
  let nickname: string | null | undefined;
  let others: {
    board: Board | "error" | null;
    shares: Map<number, Shares>;
    models: Map<number, ModelGuess[]>;
  };
  let seasons: SeasonSections;
  let groups: GroupSummary[] | "error" | null;
  try {
    const userId = await currentUserId();
    if (userId === null) {
      return (
        <PageShell heading={HEADING}>
          <SignInPrompt message="Kirjaudu sisään pelataksesi." />
        </PageShell>
      );
    }
    const now = new Date();
    [view, nickname] = await Promise.all([openGame(userId, now), nicknameOrUnknown(userId)]);
    [others, seasons, groups] = await Promise.all([
      readOthers(view, userId, now),
      readSeasonSectionOf(view, userId, now),
      groupsOf(view, userId),
    ]);
  } catch (error) {
    logger.error({ err: error }, "Reading Arvauspeli failed");
    return (
      <PageShell heading={HEADING}>
        <Notice>Arvauspelin lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }
  return (
    <PageShell heading={HEADING}>
      <GuessingGamePage
        board={others.board}
        groups={groups}
        hasNickname={nickname !== null}
        models={others.models}
        previousSeason={seasons.previous}
        season={seasons.current}
        shares={others.shares}
        view={view}
      />
    </PageShell>
  );
}
