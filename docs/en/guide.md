# Guide

**Languages:** [English](./guide.md) · [简体中文](../zh/guide.md) · [Index](./README.md)

This guide covers installation, how the API is shaped, and the `Effect`
patterns you will compose it with.

## Installation

```shell
pnpm add @lialh4/effect-dom effect
```

`effect` is a peer dependency. The library ships ESM, CJS and `.d.ts` and has no
runtime dependencies of its own.

## Imports: barrel or per-module

Every module is available both from the package root and as a subpath (better
tree-shaking):

```ts
// Barrel
import { Elem, Wait, Interact, Media } from "@lialh4/effect-dom"

// Subpaths
import { findElem, waitElem } from "@lialh4/effect-dom/Elem"
import { waitAttr, waitActionable } from "@lialh4/effect-dom/Wait"
import { click, setValue } from "@lialh4/effect-dom/Interact"
import { waitCanPlay, keepPlaying } from "@lialh4/effect-dom/Media"
import { mutStream } from "@lialh4/effect-dom/Mut"
import { getInnerDoc, waitInnerDoc } from "@lialh4/effect-dom/Doc"
import { ElemNotFoundError } from "@lialh4/effect-dom/Errors"
```

## Content scripts (MV3) and userscripts

Content scripts are loaded as classic scripts, so bundle before shipping:

```ts
// content.ts (bundled by vite/rollup/esbuild/rolldown)
import { Effect } from "effect"
import { waitElem } from "@lialh4/effect-dom/Elem"
import { safePlay } from "@lialh4/effect-dom/Interact"

const main = waitElem(document, HTMLVideoElement, "video").pipe(
  Effect.flatMap(safePlay),
)

Effect.runPromise(main)
```

`manifest.json`:

```json
{
  "manifest_version": 3,
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }]
}
```

Nothing runs at import time, so importing the library has no side effects.

## The mental model

Everything public returns an `Effect<A, E, R>` or a `Stream<A, E, R>`:

- `A` — the value you get on success.
- `E` — the **typed errors** you must handle. No `throw` ever crosses the API.
- `R` — required services; the DOM-only helpers need nothing.

```ts
import { findElem } from "@lialh4/effect-dom/Elem"
import type { SelSyntaxError, ElemNotFoundError, ElemTypeMismatchError } from "@lialh4/effect-dom/Errors"

const program = findElem(document, HTMLVideoElement, "#player")
// Effect<HTMLVideoElement, SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError>
```

Handle errors with normal `Effect` combinators:

```ts
import { Effect } from "effect"
import { findElemOpt } from "@lialh4/effect-dom/Elem"

// Fall back to Option instead of failing
const maybe = await Effect.runPromise(
  findElemOpt(document, HTMLButtonElement, "#submit"),
)

// Handle specific tags
const program = findElem(document, HTMLVideoElement, "#player").pipe(
  Effect.catchTag("ElemNotFoundError", () =>
    Effect.succeed(document.createElement("video")),
  ),
)
```

## The dual API

Every `(on, what, sel)` function is `dual`, so you can pass the query root in
either position, and each has an `xxxOn` variant for the curried style:

```ts
// data-first
findElem(document, HTMLVideoElement, "video")

// data-last
findElem(HTMLVideoElement, "video")(document)

// xxxOn
findElemOn(document, HTMLVideoElement)("video")
```

The same holds for `findElemOpt`, `isElemExists`, `findElems`, `findElemsAll`,
`waitElem`, `waitElems`, `addedStream`, `removedStream`, `attrStream` and the
`findByText` helpers. `waitElemGone`/`waitDetached` ship `xxxOn` too.

## Waits are unbounded — you own the deadline

No wait helper accepts a `timeout`. Deadlines, retries and cancellation belong
to `Effect`, and the typed error belongs to you:

```ts
import { Data, Effect } from "effect"
import { waitElem } from "@lialh4/effect-dom/Elem"

class PlayerTimeout extends Data.TaggedError("PlayerTimeout")<{ sel: string }> {}

const player = waitElem(document, HTMLVideoElement, "video").pipe(
  Effect.timeoutFail({
    duration: "10 seconds",
    onTimeout: () => new PlayerTimeout({ sel: "video" }),
  }),
)
```

Other useful combinators:

| Goal                          | Combinator                                        |
| ----------------------------- | ------------------------------------------------- |
| Bound a wait                  | `Effect.timeout` (fails with `TimeoutException`)  |
| Bound with your error         | `Effect.timeoutFail`                              |
| Return `Option` on timeout    | `Effect.timeoutOption`                            |
| Retry an operation            | `Effect.retry(Schedule.exponential("200 millis"))`|
| Race two branches             | `Effect.race` / `Effect.raceFirst`                |

## Interruption and resource safety

Anything that observes the DOM (`waitElem`, `mutStream`, `waitInView`,
`waitEvent`, `keepPlaying`, `watchStall`) registers a `MutationObserver`,
`IntersectionObserver` or listener and disconnects it when the fiber is
interrupted:

```ts
const fiber = Effect.runFork(waitElem(document, HTMLVideoElement, "video"))
// The page changed our mind:
await Effect.runPromise(Fiber.interrupt(fiber)) // observer disconnects
```

This is why the library exposes `Effect`s rather than callbacks: you never have
to remember a `disconnect()` or `clearInterval`.

## Realm safety

Content scripts run in an isolated world and iframes have their own
constructors, so `instanceof` alone is unreliable. `isElem` (used by all typed
queries) first tries `instanceof`, then resolves the constructor **by name from
the element's own realm**:

```ts
import { isElem } from "@lialh4/effect-dom/Elem"

// true even when HTMLVideoElement comes from another realm
isElem(iframeVideo, HTMLVideoElement)
```

## Testing

Because everything is an `Effect`, test it directly with `happy-dom` or `jsdom`:

```ts
import { Effect } from "effect"
import { expect, test } from "vitest"
import { waitElem } from "@lialh4/effect-dom/Elem"

test("waits for the player", async () => {
  const video = document.createElement("video")
  const fiber = Effect.runFork(waitElem(document, HTMLVideoElement, "video"))
  document.body.appendChild(video)
  await expect(Effect.runPromise(fiber)).resolves.toBe(video)
})
```

## Next

- [elem.md](./elem.md) — queries, reads, waits and streams
- [wait.md](./wait.md) — waiting for state
- [interact.md](./interact.md) — actions
- [media.md](./media.md) — playback supervision
- [observers.md](./observers.md) — raw mutations, iframes, errors, types
