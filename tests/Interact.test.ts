import { Effect, Either } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
    blur,
    check,
    click,
    dispatch,
    focus,
    hover,
    pause,
    play,
    press,
    safePlay,
    scrollIntoView,
    seek,
    setChecked,
    setInputValue,
    setMuted,
    setValue,
    setVolume,
    submit,
    type,
    uncheck,
} from "../src/Interact"

describe("Interact", () => {
    afterEach(() => {
        document.body.innerHTML = ""
    })

    test("click invokes the native click", async () => {
        const button = document.createElement("button")
        const handler = vi.fn()
        button.addEventListener("click", handler)
        await Effect.runPromise(click(button))
        expect(handler).toHaveBeenCalledTimes(1)
    })

    test("dispatch sends a custom event and reports cancellation", async () => {
        const target = document.createElement("div")
        const handler = vi.fn()
        target.addEventListener("custom", handler)
        const notCancelled = await Effect.runPromise(
            dispatch(target, new Event("custom", { cancelable: true })),
        )
        expect(notCancelled).toBe(true)
        expect(handler).toHaveBeenCalledTimes(1)
    })

    test("focus and blur update the active element", async () => {
        const input = document.createElement("input")
        document.body.appendChild(input)
        await Effect.runPromise(focus(input))
        expect(document.activeElement).toBe(input)
        await Effect.runPromise(blur(input))
        expect(document.activeElement).not.toBe(input)
    })

    test("submit requests form submission", async () => {
        const form = document.createElement("form")
        document.body.appendChild(form)
        const onSubmit = vi.fn((event: Event) => event.preventDefault())
        form.addEventListener("submit", onSubmit)
        await Effect.runPromise(submit(form))
        expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    test("setValue sets the value and emits input/change", async () => {
        const input = document.createElement("input")
        const onInput = vi.fn()
        const onChange = vi.fn()
        input.addEventListener("input", onInput)
        input.addEventListener("change", onChange)
        await Effect.runPromise(setValue(input, "hello"))
        expect(input.value).toBe("hello")
        expect(onInput).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledTimes(1)
    })

    test("setInputValue is an alias", async () => {
        const input = document.createElement("input")
        await Effect.runPromise(setInputValue(input, "alias"))
        expect(input.value).toBe("alias")
    })

    test("type appends characters one by one", async () => {
        const input = document.createElement("input")
        await Effect.runPromise(type(input, "abc"))
        expect(input.value).toBe("abc")
    })

    test("check / uncheck reflect the state", async () => {
        const box = document.createElement("input")
        box.type = "checkbox"
        await Effect.runPromise(check(box))
        expect(box.checked).toBe(true)
        await Effect.runPromise(uncheck(box))
        expect(box.checked).toBe(false)
        await Effect.runPromise(setChecked(box, true))
        expect(box.checked).toBe(true)
    })

    test("press dispatches keyboard events", async () => {
        const target = document.createElement("input")
        const onKeyDown = vi.fn()
        const onKeyUp = vi.fn()
        target.addEventListener("keydown", onKeyDown)
        target.addEventListener("keyup", onKeyUp)
        await Effect.runPromise(press(target, "Enter"))
        expect(onKeyDown).toHaveBeenCalledTimes(1)
        expect(onKeyUp).toHaveBeenCalledTimes(1)
    })

    test("hover dispatches mouse events", async () => {
        const div = document.createElement("div")
        const onOver = vi.fn()
        div.addEventListener("mouseover", onOver)
        await Effect.runPromise(hover(div))
        expect(onOver).toHaveBeenCalledTimes(1)
    })

    test("scrollIntoView is forwarded", async () => {
        const div = document.createElement("div")
        const spy = vi.fn()
        Object.defineProperty(div, "scrollIntoView", {
            value: spy,
            configurable: true,
        })
        await Effect.runPromise(scrollIntoView(div))
        expect(spy).toHaveBeenCalledTimes(1)
    })

    test("safePlay resolves true when playback starts", async () => {
        const media = document.createElement("audio")
        await expect(Effect.runPromise(safePlay(media))).resolves.toBe(true)
    })

    test("safePlay resolves false when playback is rejected", async () => {
        const media = document.createElement("audio")
        Object.defineProperty(media, "play", {
            configurable: true,
            value: () => Promise.reject(new Error("blocked")),
        })
        await expect(Effect.runPromise(safePlay(media))).resolves.toBe(false)
        const result = await Effect.runPromise(play(media).pipe(Effect.either))
        expect(Either.isLeft(result)).toBe(true)
        if (Either.isLeft(result))
            expect(result.left._tag).toBe("MediaPlayError")
    })

    test("media controls are invoked", async () => {
        const media = document.createElement("audio")
        const pauseSpy = vi.fn()
        const playSpy = vi.fn(() => Promise.resolve())
        Object.defineProperty(media, "pause", {
            configurable: true,
            value: pauseSpy,
        })
        Object.defineProperty(media, "play", {
            configurable: true,
            value: playSpy,
        })

        await Effect.runPromise(play(media))
        await Effect.runPromise(pause(media))
        await Effect.runPromise(seek(media, 5))
        await Effect.runPromise(setMuted(media, true))
        await Effect.runPromise(setVolume(media, 2))

        expect(playSpy).toHaveBeenCalledTimes(1)
        expect(pauseSpy).toHaveBeenCalledTimes(1)
        expect(media.currentTime).toBe(5)
        expect(media.muted).toBe(true)
        expect(media.volume).toBe(1)
    })
})
