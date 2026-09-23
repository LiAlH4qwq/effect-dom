import { Effect, Option, Stream } from "effect"
import { StallError } from "./Errors"
import { safePlay, setMuted, setPlaybackRate, setVolume } from "./Interact"
import { type WaitOpts, waitAny, waitEvent, waitFor } from "./Wait"

export { isMediaEnded, waitMediaEnded } from "./Wait"

const HAVE_METADATA = 1
const HAVE_CURRENT_DATA = 2
const HAVE_FUTURE_DATA = 3
const HAVE_ENOUGH_DATA = 4

const readyEvent = (state: number): string | null => {
    if (state >= HAVE_ENOUGH_DATA) return "canplaythrough"
    if (state === HAVE_FUTURE_DATA) return "canplay"
    if (state === HAVE_CURRENT_DATA) return "loadeddata"
    if (state === HAVE_METADATA) return "loadedmetadata"
    return null
}

/**
 * Waits until `media.readyState >= state`, resolving with the corresponding
 * media event when there is one and polling otherwise. This is how you tell
 * "element exists" apart from "playable" — with `preload="none"` the readyState
 * stays at `HAVE_NOTHING` until playback is requested.
 */
export const waitReadyState = (
    media: HTMLMediaElement,
    state: number,
    opts?: WaitOpts,
): Effect.Effect<void> =>
    Effect.suspend(() => {
        if (media.readyState >= state) return Effect.void
        const event = readyEvent(state)
        const poll = waitFor(() => media.readyState >= state, opts)
        return event === null
            ? poll
            : waitAny([waitEvent(media, event), poll]).pipe(Effect.asVoid)
    })

/**
 * Waits until playback can begin (`readyState >= HAVE_FUTURE_DATA`).
 */
export const waitCanPlay = (
    media: HTMLMediaElement,
    opts?: WaitOpts,
): Effect.Effect<void> => waitReadyState(media, HAVE_FUTURE_DATA, opts)

export interface StallOpts extends WaitOpts {
    /**
     * Maximum movement of `currentTime` between samples still considered
     * frozen. Defaults to `0.01` seconds.
     */
    readonly epsilon?: number
}

interface StallSample {
    readonly time: number
    readonly paused: boolean
}

interface StallState {
    readonly previous: Option.Option<number>
    readonly reason: Option.Option<"paused" | "frozen">
}

const isFrozen = (
    current: number,
    previous: number,
    epsilon: number,
): boolean => Math.abs(current - previous) <= epsilon

const nextStallState = (
    epsilon: number,
    acc: StallState,
    sample: StallSample,
): StallState =>
    sample.paused
        ? {
              previous: Option.some(sample.time),
              reason: Option.some("paused"),
          }
        : Option.isSome(acc.previous) &&
            isFrozen(sample.time, acc.previous.value, epsilon)
          ? {
                previous: Option.some(sample.time),
                reason: Option.some("frozen"),
            }
          : { previous: Option.some(sample.time), reason: Option.none() }

/**
 * Watches playback and fails with a {@link StallError} as soon as the media is
 * paused, or its `currentTime` stops advancing while it reports `paused = false`.
 * Runs forever while playback is healthy; interrupt it (or race it) when done.
 */
export const watchStall = (
    media: HTMLMediaElement,
    opts: StallOpts = {},
): Effect.Effect<void, StallError> => {
    const epsilon = opts.epsilon ?? 0.01
    const initial: StallState = {
        previous: Option.none(),
        reason: Option.none(),
    }
    return Stream.tick(opts.interval ?? "50 millis").pipe(
        Stream.map(
            (): StallSample => ({
                time: media.currentTime,
                paused: media.paused,
            }),
        ),
        Stream.scan(initial, (acc, sample) =>
            nextStallState(epsilon, acc, sample),
        ),
        Stream.filterMap(state => state.reason),
        Stream.runHead,
        Effect.flatMap(
            Option.match({
                onNone: () => Effect.never,
                onSome: reason =>
                    Effect.fail(
                        new StallError({
                            media,
                            reason,
                            currentTime: media.currentTime,
                            duration: media.duration,
                        }),
                    ),
            }),
        ),
    )
}

/**
 * Pure tolerance-aware end check: `ended`, or `currentTime` within `tolerance`
 * of a finite `duration`. Streams that stop short of the exact duration never
 * fire `ended`; this catches them.
 */
export const isEndedWithin = (
    media: HTMLMediaElement,
    tolerance: number,
): boolean =>
    media.ended ||
    (Number.isFinite(media.duration) &&
        media.duration > 0 &&
        media.currentTime >= media.duration - tolerance)

/**
 * Waits until playback is within `tolerance` of the end (see
 * {@link isEndedWithin}). Unbounded; compose with `Effect.timeout`.
 */
export const endedWithin = (
    media: HTMLMediaElement,
    tolerance: number,
    opts?: WaitOpts,
): Effect.Effect<void> => waitFor(() => isEndedWithin(media, tolerance), opts)

/**
 * Nudges the platform into finishing by seeking to a finite `duration`, which
 * makes it fire `ended`/`complete`. Safe no-op for live streams.
 */
export const finishMedia = (media: HTMLMediaElement): Effect.Effect<void> =>
    Effect.sync(() => {
        if (Number.isFinite(media.duration)) media.currentTime = media.duration
    })

export interface KeepPlayingOpts extends WaitOpts {
    readonly muted?: boolean
    readonly playbackRate?: number
    readonly volume?: number
    /**
     * Re-issue `play()` whenever the media is paused (and not ended).
     * Defaults to `true`.
     */
    readonly resume?: boolean
}

const reconcile = (
    media: HTMLMediaElement,
    opts: KeepPlayingOpts,
): Effect.Effect<void> =>
    Effect.suspend(() =>
        Effect.all(
            [
                opts.muted === undefined
                    ? Effect.void
                    : setMuted(media, opts.muted),
                opts.volume === undefined
                    ? Effect.void
                    : setVolume(media, opts.volume),
                opts.playbackRate === undefined
                    ? Effect.void
                    : setPlaybackRate(media, opts.playbackRate),
                (opts.resume ?? true) && media.paused && !media.ended
                    ? safePlay(media).pipe(Effect.asVoid)
                    : Effect.void,
            ],
            { discard: true },
        ),
    )

/**
 * Supervisor that keeps a player playing: re-applies `muted`/`volume`/
 * `playbackRate` and re-issues `play()` if the site resets them and pauses the
 * media. Runs forever; fork it and interrupt when you navigate away.
 */
export const keepPlaying = (
    media: HTMLMediaElement,
    opts: KeepPlayingOpts = {},
): Effect.Effect<void> =>
    Effect.zipRight(
        reconcile(media, opts),
        Stream.tick(opts.interval ?? "50 millis").pipe(
            Stream.mapEffect(() => reconcile(media, opts)),
            Stream.runDrain,
        ),
    )
