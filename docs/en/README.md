# Effect Dom — Documentation

**Languages:** [English](./README.md) · [简体中文](../zh/README.md)

`@lialh4/effect-dom` is a type-safe, reactive DOM automation layer for browser
extensions and userscripts. Every DOM operation is an `Effect`: failures are in
the type, waiting is event-driven, and interruption releases resources.

- NPM: `@lialh4/effect-dom`
- Root README: [English](../../README.md) · [简体中文](../../README.CN.md)
- Peer dependency: [`effect`](https://effect.website) ^3.18

## Contents

| Page                          | What it covers                                                            |
| ----------------------------- | ------------------------------------------------------------------------- |
| [guide.md](./guide.md)        | Install, content-script setup, mental model, dual API, timeouts, testing  |
| [elem.md](./elem.md)          | Querying, reading, waiting for elements and element streams               |
| [wait.md](./wait.md)          | Waiting for state: attributes, visibility, actionability, events, races   |
| [interact.md](./interact.md)  | Clicking, typing, setting values, keyboards, media controls               |
| [media.md](./media.md)        | Readiness, stall detection, tolerant end, force-finish, supervision       |
| [observers.md](./observers.md)| Raw mutation streams, iframes, error taxonomy, shared types               |

## Quick install

```shell
pnpm add @lialh4/effect-dom effect
```

## The 60-second tour

```ts
import { Effect } from "effect"
import { findElem, waitElem, findByText } from "@lialh4/effect-dom/Elem"
import { click, setValue, safePlay } from "@lialh4/effect-dom/Interact"
import { waitCanPlay, watchStall, keepPlaying } from "@lialh4/effect-dom/Media"

const program = Effect.gen(function* () {
  // find: fails with a typed error, never throws
  const email = yield* findElem(document, HTMLInputElement, "input[type=email]")

  // interact: framework-safe value setting
  yield* setValue(email, "me@example.com")

  // wait: event-driven, cancellable, unbounded (bound it with Effect.timeout)
  const video = yield* waitElem(document, HTMLVideoElement, "video").pipe(
    Effect.timeout("10 seconds"),
  )

  // media: element existing is not the same as playable
  yield* waitCanPlay(video)
  yield* safePlay(video)

  // supervise: fail the group if playback freezes
  yield* Effect.all([keepPlaying(video), watchStall(video)], {
    concurrency: "unbounded",
  })
})
```

## Design principles

1. **Useful** — covers the frequent DOM needs of extensions and userscripts.
2. **Concise** — small surface, no site-specific helpers.
3. **Strictly functional** — no loops, no mutation, no thrown exceptions.
4. **Strictly safe** — if `pnpm check` and `pnpm test` pass, the API is total.
