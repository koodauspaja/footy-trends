# 856 — "review round" is refused only with its number: decisions

Bug #856. The commit-msg hook refused `chore: a behaviour defect from any review round is fixed … (#838)`, a subject that says what the commit changes, because the "review round" shape matched the two words anywhere in a clause. Narrows a shape of `decisions/841-commit-subject-gate.md`.

| Decision | Why |
|---|---|
| **"review round" is refused only when a round's number follows it**: `review round 2`, `review round #3`, `review round two` | That is the form #841's scope names ("review round N"): a commit that is nothing but a round. Without the number, the words describe a change to how rounds work, which is a change, and `review round-trip` passes as before |
