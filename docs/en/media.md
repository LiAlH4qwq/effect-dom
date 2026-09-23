# Media

**Languages:** [English](./media.md) · [简体中文](../zh/media.md) · [Index](./README.md)

Playback supervision for `<audio>`/`<video>`: things that are DOM/media
semantics rather than generic `Effect` concerns.

```ts
import { Effect } from "effect"
import * as Media from "@lialh4/effect-dom/Media"
```

## Why a separate module

A media element existing is not the same as it being playable, and its `ended`
event is not reliable when a stream stops short. These are the bugs this module
exists to remove:

- `preload="none"` keeps `readyState` at `0` until you request playback.
- A hung video reports `paused = false` while `currentTime` is frozen.
- A stream can stop ~2 seconds before `duration`, so `ended` never fires.
- Sites reset `muted`/`playbackRate` and pause the player right after you play it.

## Readiness

```ts
Media.waitReadyState(media, state, opts?): Effect<void>
Media.waitCanPlay(media, opts?): Effect<void>
```

`waitReadyState` resolves when `readyState >= state`, using the matching media
event (`loadedmetadata`, `loadeddata`, `canplay`, `canplaythrough`) and falling
back to polling. `waitCanPlay` is `waitReadyState(media, 3)` (i.e.
`HAVE_FUTURE_DATA`). It does **not** call `play()` for you — with
`preload="none"`, start playback first (`Interact.safePlay`) and then await it.

```ts
import { safePlay } from "@lialh4/effect-dom/Interact"

yield* safePlay(video)
yield* Media.waitCanPlay(video, { interval: "100 millis" })
```

`readyState` constants: `0` `HAVE_NOTHING`, `1` `HAVE_METADATA`, `2`
`HAVE_CURRENT_DATA`, `3` `HAVE_FUTURE_DATA`, `4` `HAVE_ENOUGH_DATA`.

## Stall detection

```ts
interface StallOpts extends WaitOpts {
  readonly epsilon?: number // default 0.01s
}

Media.watchStall(media, opts?): Effect<void, StallError>
```

`watchStall` samples `currentTime` and `paused` every `interval`. It fails with a
`StallError` as soon as the media is paused, or its `currentTime` fails to move
by more than `epsilon` while `paused = false`. While playback is healthy it
runs forever, so race it with whatever you are actually waiting for:

```ts
import { waitEvent } from "@lialh4/effect-dom/Wait"

// fail with StallError if playback freezes; finish if the user pauses instead
yield* Media.watchStall(video).pipe(
  Effect.raceFirst(waitEvent(video, "pause")),
)
```

`StallError` carries `{ media, reason: "paused" | "frozen", currentTime, duration }`.

## Tolerant end

```ts
Media.isEndedWithin(media, tolerance): boolean
Media.endedWithin(media, tolerance, opts?): Effect<void>
```

`isEndedWithin` is the pure check (`ended`, or `currentTime >= duration - tolerance`);
`endedWithin` waits for it. Use it for streams that stop short of the exact
duration:

```ts
yield* Media.endedWithin(video, 2) // within 2 seconds of the end
```

## Force finish

```ts
Media.finishMedia(media): Effect<void>
```

Seeks to a finite `duration` so the platform fires its `ended`/`complete` path.
No-op for live streams (non-finite duration).

## Supervision

```ts
interface KeepPlayingOpts extends WaitOpts {
  readonly muted?: boolean
  readonly playbackRate?: number
  readonly volume?: number
  readonly resume?: boolean // default true
}

Media.keepPlaying(media, opts?): Effect<void>
```

`keepPlaying` runs forever, re-applying `muted`/`volume`/`playbackRate` every
tick and re-issuing `play()` whenever the media is paused (and not ended). Fork
it and interrupt on navigation, or combine it with `watchStall` so the group
fails when playback hangs:

```ts
import { keepPlaying, watchStall } from "@lialh4/effect-dom/Media"

yield* Effect.all(
  [
    keepPlaying(video, { muted: true, playbackRate: 1.5 }),
    watchStall(video),
  ],
  { concurrency: "unbounded" },
)
```

## Re-exports

`Media` re-exports `isMediaEnded` and `waitMediaEnded` from
[Wait](./wait.md#media-helpers) so media users only need one import.

## Gotchas

- `watchStall` treats `paused` as a stall. Start it *after* you begin playback.
- All media waits are unbounded; bound them with `Effect.timeout` /
  `Effect.timeoutFail`.
- `finishMedia` on a live stream (`duration === Infinity`) does nothing.
