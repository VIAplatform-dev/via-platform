---
name: Never commit or push without explicit permission
description: User has repeatedly said not to auto-commit or push. Always wait for explicit "commit and push" instruction
type: feedback
---

Never run git commit or git push unless the user explicitly says to commit/push. Do not commit after code changes even if the fix seems complete. Always stop at the code change and wait for the user to say "ok commit" or similar.

**Why:** User has corrected this multiple times and is extremely frustrated. Auto-committing feels presumptuous and removes their control over what goes into the repo. Explicitly said "stop auto commit and pushing" on May 2, May 3, May 12, and May 20 2026. A "commit and push" instruction covers ONLY the changes made at that moment, not any subsequent fixes made in the same conversation.

**How to apply:** After ANY code change, stop immediately. Do not run git add, git commit, or git push under any circumstances. Wait for the user to explicitly say "commit", "commit and push", or "push". No exceptions, no "just this once", never.
