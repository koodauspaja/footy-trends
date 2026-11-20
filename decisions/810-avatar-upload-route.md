# 810 — The avatar upload is a route handler, and server actions keep Next's 1 MB limit: decisions

Chore #810. Overrides the choice in `specs/025-custom-avatar.md` (*Writing —
server actions*) of a server action for the upload, and the
`bodySizeLimit: "10mb"` that `decisions/025-custom-avatar.md` (*The byte cap
was a fiction*) added for it. Next offers that limit only for every server
action at once, so all of them accepted a 10 MB body, read before their own
checks ran, for the one action that needed it.

| Decision | Why |
|---|---|
| `POST /api/avatar/me`, beside the `GET` that serves the picture | One path for the reader's own picture, read and written. The session says whose it is, as on `GET` |
| The body is the chosen file's bytes as they are, `application/octet-stream`, not a form | `request.formData()` reads the whole body before anything can count it. A plain body is read chunk by chunk, so the cap stops reading at the chunk that passes 8 MB and cancels the rest |
| The cap is the stream count alone, with no `Content-Length` check | One rule in one place. A length header can be absent or wrong, and the count decides either way |
| The origin check compares `Origin` with the request's host, `x-forwarded-host` first, as Next's server-action check does | That check is what protected the upload as an action. It works behind Railway's proxy, where server actions already pass it, and on any local port. `BETTER_AUTH_URL`, which the issue named, is `http://localhost:3000` in CI and release while e2e serves on 3001, so it would refuse every upload there |
| A request with no `Origin`, or `null`, is refused | Next lets one through with a warning. Every current browser sends `Origin` on a `POST`, so only a hand-made request lacks it, and this one carries a session cookie |
| Origin first, then the session, then the body | A foreign request reaches nothing, and a signed-out caller's bytes are never read |
| Each answer has a status, 200, 400, 401, 403, 413, 415, 422 or 500, and a JSON body of the same `SaveAvatarResult` the action returned | The page reads the body, so its Finnish notices are unchanged. The status is for logs and anything else reading the route. Answers are `no-store` |
| `uploadAvatar` throws on an answer it cannot read, a proxy's error page for one | The page's `catch` already reports to Sentry and shows the generic notice for a rejected upload. Reading an unknown answer as `failed` would show the same notice and report nothing |
| `saveAvatarAction` is removed, and `removeAvatarAction` stays an action | Removing carries no body. Two paths to upload would be two rules to keep in step |
| A refused origin is a `warn` line with no fields | It is new behaviour, and the line says it happened without carrying an address or a host |

The cost the spec named stands: the upload is now the one write on the settings
page that is not a server action. Its other reason, that a route handler has no
origin check of its own, is answered by the check above.

## Measured

On 2026-11-21, in `tests/unit/app/api/avatar-route.test.ts`, against a body
of twenty 1 MB chunks that counts what is pulled from it: the route pulls nine,
eight that fit and the one that passes the cap, answers 413, and never pulls the
tenth. A body of exactly 8 MB is stored.
