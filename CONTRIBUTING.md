# Git Workflow

How we work in parallel without stepping on each other. Read once, bookmark the "Daily loop" section.

## The 3 rules

1. **Never commit directly to `main`.** Everything lands through a branch + PR.
2. **Stay inside the component you're working on.** Edits confined to one directory almost never conflict.
3. **Merge often.** A branch alive for 12 hours is a conflict waiting to happen. Aim to merge every 2–3 hours.

## Components & branch prefixes

| Directory | Scope | Branch prefix |
|---|---|---|
| `gateway/` | Rust gateway, routing dispatch | `feat/gateway-*` |
| `router-ml/` | Embeddings, scoring, model selection | `feat/ml-*` |
| `web/app/playground/`, `web/components/` | Playground UI | `feat/web-*` |
| `web/app/dashboard/`, `web/app/api/` | Dashboard & data layer | `feat/dash-*` |

**Shared files — announce in the group chat before touching:** `packages/types/`, `migrations/`, `docker-compose.yml`, `PRD.md`, `.env.example`. These are the only real conflict risk.

## Branch names

```
<type>/<area>-<what>

feat/gateway-chat-endpoint
feat/ml-knn-scoring
fix/web-streaming-render
refactor/dash-stats-query
docs/prd-update
```

Types: `feat` `fix` `refactor` `docs` `chore`

## Daily loop

This is 90% of what you'll run. Memorize it.

```bash
# 1. start from fresh main
git checkout main
git pull

# 2. make your branch
git checkout -b feat/gateway-chat-endpoint

# 3. ... write code ...

# 4. commit (single-line, conventional format)
git add -A
git commit -m "feat: add chat completions endpoint"

# 5. push
git push -u origin feat/gateway-chat-endpoint
```

Then open the PR on GitHub (the push output prints a link — just click it). Get a quick look from someone, then **Squash and merge**.

After merging, get back to a clean state:

```bash
git checkout main
git pull
git branch -d feat/gateway-chat-endpoint   # delete the local branch
```

## Commit messages

One line. Conventional prefix. That's it.

```
✅ feat: add kNN scoring to /route
✅ fix: handle empty candidate list
✅ docs: add PRD

❌ updated stuff
❌ final fix pls work
❌ Merge branch 'main' of github.com...
```

## PR rules

- **Changes inside one component** → self-merge is fine. Speed matters.
- **Shared files** (`packages/types/`, `migrations/`) → get one approval first.
- Always **Squash and merge**. Keeps `main` history one-commit-per-feature and readable.
- Small PRs. 200 lines is great, 2000 lines is a nightmare nobody will review.

## When main has moved ahead of you

Happens when something merges while you're working. Your branch is now behind:

```bash
git checkout main
git pull
git checkout feat/my-branch
git merge main
```

If it says `CONFLICT`, see below. If not, you're done — keep working.

## Fixing a merge conflict

Don't panic. Git marks the clashing spots in the file like this:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> main
```

1. Open the file, delete the `<<<<<<<`, `=======`, `>>>>>>>` lines
2. Keep whichever code is correct (often **both**, stitched together)
3. Save, then:

```bash
git add -A
git commit -m "fix: resolve merge conflict"
git push
```

`git status` always tells you which files still need fixing.

## Panic buttons

| Situation | Command |
|---|---|
| Undo uncommitted changes to one file | `git checkout -- path/to/file` |
| Stash work temporarily | `git stash` → later `git stash pop` |
| Committed but not pushed, want to undo | `git reset --soft HEAD~1` |
| Everything is broken, want a safety copy | `git branch backup-my-work` |
| Genuinely lost | `git branch backup-$(date +%s)`, then ask before doing anything else |

**Run `git branch backup-whatever` before anything scary.** It costs nothing and means you can never actually lose work.

## What NOT to do

- ❌ `git push --force` on `main` — can erase someone's work permanently
- ❌ Committing `.env`, `node_modules/`, `target/`, `*.npy` — check `.gitignore` first
- ❌ Sitting on an unmerged branch all day
- ❌ Editing another component's files without saying so

## First-time setup

Run once per machine:

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
git config --global pull.rebase false     # merge on pull; simpler to reason about
git config --global init.defaultBranch main
```
