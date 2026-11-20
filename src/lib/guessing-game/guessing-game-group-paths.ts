/**
 * The URLs of a group's page and of an invite link, for the server's pages and
 * the browser's controls alike: a module of its own, since a value exported
 * from a client module reaches a server component as a reference, not a value.
 *
 * decisions/078-private-groups.md
 */

export function groupPath(groupId: number): string {
  return `/arvauspeli/ryhmat/${groupId}`;
}

export function invitePath(token: string): string {
  return `/arvauspeli/liity/${token}`;
}
