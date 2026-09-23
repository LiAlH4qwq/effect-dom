import { Effect, Either, Fiber } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
    endedWithin,
    finishMedia,
    isEndedWithin,
    isMediaEnded,
    keepPlaying,
    waitCanPlay,
    waitMediaEnded,
    waitReadyState,
    watchStall,
} from "../src/Media"

interface MediaState {
    readyState: number
    currentTime: number
    paused: boolean
    ended: boolean
    duration: number
    muted: boolean
    volume: number
    playbackRate: number
}

const fakeMedia = (initial: Partial<MediaState> = {}) => {
    const state: MediaState = {
        readyState: 0,
        currentTime: 0,
        paused: true,
        ended: false,
        duration: Number.NaN,
        muted: false,
        volume: 1,
        playbackRate: 1,
        ...initial,
    }
    const media = document.createElement("audio")
    const keys: ReadonlyArray<keyof MediaState> = [
        "readyState",
        "currentTime",
        "paused",
        "ended",
        "duration",
        "muted",
        "volume",
        "playbackRate",
    ]
    keys.forEach(key => {
        Object.defineProperty(media, key, {
            configurable: true,
            get: () => state[key],
            set: (value: number | boolean) => {
                ;(state as unknown as Record<string, unknown>)[key] = value
            },
        })
    })
    return { media, state }
}

const fork = <A, E>(effect: Effect.Effect<A, E>, mutate: () => void) =>
    Effect.gen(function* () {
        const fiber = yield* Effect.fork(effect)
        yield* Effect.sleep("20 millis")
        mutate()
        return yield* Fiber.join(fiber)
    })

describe("Media", () => {
    afterEach(() => {
        document.body.innerHTML = ""
        vi.restoreAllMocks()
    })

    test("waitReadyState resolves when already ready", async () => {
        const { media } = fakeMedia({ readyState: 3 })
        await expect(
            Effect.runPromise(waitReadyState(media, 3)),
        ).resolves.toBeUndefined()
    })

    test("waitReadyState polls until the state is reached", async () => {
        const { media, state } = fakeMedia({ readyState: 0 })
        await Effect.runPromise(
            fork(waitReadyState(media, 3, { interval: "10 millis" }), () => {
                state.readyState = 3
            }),
        )
        expect(state.readyState).toBe(3)
    })

    test("waitReadyState also resolves on the matching event", async () => {
        const { media, state } = fakeMedia({ readyState: 0 })
        await Effect.runPromise(
            fork(waitReadyState(media, 1, { interval: "10 seconds" }), () => {
                state.readyState = 1
                media.dispatchEvent(new Event("loadedmetadata"))
            }),
        )
        expect(state.readyState).toBe(1)
    })

    test("waitCanPlay resolves once playable", async () => {
        const { media, state } = fakeMedia({ readyState: 0 })
        await Effect.runPromise(
            fork(waitCanPlay(media, { interval: "10 millis" }), () => {
                state.readyState = 3
            }),
        )
        expect(state.readyState).toBe(3)
    })

    test("watchStall fails when currentTime freezes", async () => {
        const { media } = fakeMedia({
            currentTime: 5,
            paused: false,
            duration: 10,
        })
        const either = await Effect.runPromise(
            watchStall(media, { interval: "10 millis" }).pipe(
                Effect.timeout("2 seconds"),
                Effect.either,
            ),
        )
        expect(Either.isLeft(either)).toBe(true)
        if (Either.isLeft(either)) {
            expect(either.left._tag).toBe("StallError")
            if (either.left._tag === "StallError") {
                expect(either.left.reason).toBe("frozen")
            }
        }
    })

    test("watchStall fails when paused", async () => {
        const { media } = fakeMedia({ currentTime: 5, paused: true })
        const either = await Effect.runPromise(
            watchStall(media, { interval: "10 millis" }).pipe(
                Effect.timeout("2 seconds"),
                Effect.either,
            ),
        )
        expect(Either.isLeft(either)).toBe(true)
        if (Either.isLeft(either) && either.left._tag === "StallError") {
            expect(either.left.reason).toBe("paused")
        }
    })

    test("isEndedWithin is tolerance aware", () => {
        const { media } = fakeMedia({ currentTime: 8, duration: 10 })
        expect(isEndedWithin(media, 3)).toBe(true)
        expect(isEndedWithin(media, 1)).toBe(false)
    })

    test("endedWithin waits until within tolerance", async () => {
        const { media, state } = fakeMedia({ currentTime: 8, duration: 10 })
        await Effect.runPromise(
            fork(endedWithin(media, 1, { interval: "10 millis" }), () => {
                state.currentTime = 9.5
            }),
        )
        expect(isEndedWithin(media, 1)).toBe(true)
    })

    test("finishMedia seeks to a finite duration", async () => {
        const { media, state } = fakeMedia({ duration: 10, currentTime: 0 })
        await Effect.runPromise(finishMedia(media))
        expect(state.currentTime).toBe(10)
    })

    test("finishMedia is a no-op for live streams", async () => {
        const { media, state } = fakeMedia({ currentTime: 0 })
        await Effect.runPromise(finishMedia(media))
        expect(state.currentTime).toBe(0)
    })

    test("keepPlaying reapplies settings and resumes", async () => {
        const { media, state } = fakeMedia({
            paused: true,
            muted: false,
            volume: 0.2,
            playbackRate: 1,
        })
        const playSpy = vi.fn(() => Promise.resolve())
        Object.defineProperty(media, "play", {
            configurable: true,
            value: playSpy,
        })
        await Effect.runPromise(
            Effect.raceFirst(
                keepPlaying(media, {
                    muted: true,
                    volume: 0.5,
                    playbackRate: 2,
                    interval: "10 millis",
                }),
                Effect.sleep("60 millis"),
            ),
        )
        expect(state.muted).toBe(true)
        expect(state.volume).toBe(0.5)
        expect(state.playbackRate).toBe(2)
        expect(playSpy).toHaveBeenCalled()
    })

    test("keepPlaying can skip resuming", async () => {
        const { media } = fakeMedia({ paused: true })
        const playSpy = vi.fn(() => Promise.resolve())
        Object.defineProperty(media, "play", {
            configurable: true,
            value: playSpy,
        })
        await Effect.runPromise(
            Effect.raceFirst(
                keepPlaying(media, {
                    resume: false,
                    interval: "10 millis",
                }),
                Effect.sleep("40 millis"),
            ),
        )
        expect(playSpy).not.toHaveBeenCalled()
    })

    test("isMediaEnded / waitMediaEnded are re-exported", async () => {
        const { media } = fakeMedia({ currentTime: 10, duration: 10 })
        expect(isMediaEnded(media)).toBe(true)
        await expect(
            Effect.runPromise(waitMediaEnded(media)),
        ).resolves.toBeUndefined()
    })
})
