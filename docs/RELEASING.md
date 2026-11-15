# Building, verifying and releasing AutoLL-3

Moved out of `README.md` on 2026-09-21, when that file was cut back to an
introduction. Nothing here changed in the move; the branch-policy note in
particular is recorded nowhere else.

## Development

```bash
npm ci
npm run checkall     # tests, lint, typecheck
npm run harness      # the real screens against fake clients
npm run build
```

Development servers bind to loopback by default. For deliberate phone/LAN
testing on a trusted network, use `npm run start:lan` or `npm run harness:lan`.
The weekly Dependency audit workflow and dependency-changing pull requests
report high/critical advisories in the complete lockfile, including dev tools.
Rollup is temporarily pinned to patched 4.59.0: 4.64.0 spent more than three
minutes in tree-shaking this application in the v1.8.3 rehearsal. Review this
override with future toolchain updates; the full dependency audit still applies.

[FORK.md](../FORK.md) explains why a plain upstream build does not run and how
the deploy assembles one. [docs/PLAN.md](PLAN.md) is the booking-intelligence
roadmap and the record of what was decided; [docs/UX-PLAN.md](UX-PLAN.md) is the
same for the screens; [docs/FUTURE.md](FUTURE.md) is what remains, and
[ROADMAP.md](../ROADMAP.md) is what to do about it next.
[docs/USER-GUIDE.md](USER-GUIDE.md) is the guide written for whoever is holding
the phone, rather than for whoever is changing the code.
[SECURITY.md](../SECURITY.md) covers token handling.
[docs/SYNC.md in AutoLL-4](https://github.com/mbs1234/AutoLL-4/blob/main/docs/SYNC.md)
governs syncing the two builds.

## Verifying a build

Every deploy writes
[`autoll3-release.json`](https://ll.herzig.net/autoll3-release.json)
and `autoll3-files.sha256` into the published site: the exact revisions the site
is assembled from, plus a SHA-256 of every file served. Point a browser at it
before a park day and confirm the build on your phone is the one the repository
says it is — or read the revision off the Settings menu, which names the commit
the bundle was built from.

The strongest check is that a local build of the same commit reproduces the
served bundle byte for byte:

```bash
npm run build
shasum -a 256 dist/bg1.js
curl -s https://ll.herzig.net/bg1.js | shasum -a 256
```

Build the commit the manifest names, not a branch — the build embeds its own
revision, so a build of a different commit will differ for that reason alone.

## Releasing, and rolling back

A tagged release is that pair of manifest files together with the tag, and both
are attached to the
[release](https://github.com/mbs1234/AutoLL-3/releases) as well as served from
the site. Re-running the deploy workflow against a tag rebuilds the same site,
which is what makes a rollback a one-command operation rather than a rebuild
from memory:

```bash
gh workflow run deploy.yml --ref autoll3-v1.3.0
```

The release is not complete until `gh release view` lists both manifest files; a
pushed tag on its own does not satisfy the promise above.

A tag deploy restores the *served* site. It does not revert `main` — if the
build being rolled back is wrong rather than merely unlucky, revert the commit
too, or the next push to `main` re-ships it.

That rollback needs one repository setting that is easy to miss, because nothing
in this tree records it: the `github-pages` environment has a deployment branch
policy, and it permitted `main` only. A workflow dispatched against a tag
therefore built correctly and was then refused at the deploy step, with no steps
recorded and nothing naming the cause. A `tag: autoll3-v*` policy was added
beside the branch one. Anything forking this to a new repository has to add it
again.

## Self-hosted site

This fork is served by nginx at <https://ll.herzig.net/>, at the site root
rather than under `/AutoLL-3/`. The files nginx should serve are the `site-ll`
branch: static files at the repository root, the same shape as upstream's
`goofy` branch.

```bash
git clone --branch site-ll --depth 1 https://github.com/kevinherzig/AutoLL-3.git site
```

Point the nginx `root` at that checkout. Do not expose its `.git` directory.

`scripts/assemble-site.sh` is the assembly the deploy workflow runs: a fresh
`vite build`, the pinned AutoLL-2 installer pages and `sensor-data.js`, the
URL rewrite onto `https://ll.herzig.net`, the user guide and the release
manifest. Rebuild and publish a replacement branch with:

```bash
bash scripts/assemble-site.sh --publish
git push origin site-ll
```

`--publish` commits `dist/` onto the local `site-ll` branch and does not push.
The script needs GNU `find`, `sed` and `sha256sum`, and a network path to the
public AutoLL-2 pins. `github.com/joelface/bg1` and `github.com/jgeurts/bg1`
are left in `contact.html`; those are the GPL attribution.

## It depends on AutoLL-2 to publish

The inherited assets the published site is assembled from come from immutable
AutoLL-2 revisions pinned in the deploy workflow. AutoLL-2 must stay public for
AutoLL-3 to build a site; moving those pins is an explicit reviewed release
change rather than an implicit branch update.

## What the pipeline guarantees

`main` is protected: a pull request, a passing `check` run, linear history, no
force-pushes. The deploy gates independently on typecheck and the full test
suite, and if either fails the publish is skipped and Pages keeps serving the
build already on your phone.

A green pipeline is not evidence about the sensor path. No test in this
repository loads `src/api/sensor-data.ts` — `jest.config.js` maps it to a mock —
so that file can be wrong in every way and the suite stays green. Read it by eye
whenever it changes.
