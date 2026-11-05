import type { Metadata } from "next";
import { GuessingGamePage } from "@/components/guessing-game-page";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { currentUserId } from "@/lib/current-user";
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
 * `/arvauspeli`: a signed-in reader's way into the game, or their balance and
 * guesses. A failed read says so, never "signed out".
 *
 * decisions/072-match-guesses.md
 * decisions/077-nickname.md
 */
export default async function GuessingGame() {
  let view: GameView;
  let nickname: string | null | undefined;
  try {
    const userId = await currentUserId();
    if (userId === null) {
      return (
        <PageShell heading={HEADING}>
          <SignInPrompt message="Kirjaudu sisään pelataksesi." />
        </PageShell>
      );
    }
    [view, nickname] = await Promise.all([openGame(userId, new Date()), nicknameOrUnknown(userId)]);
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
      <GuessingGamePage hasNickname={nickname !== null} view={view} />
    </PageShell>
  );
}
