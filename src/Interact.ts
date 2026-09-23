import { Array, Effect } from "effect"
import { MediaPlayError } from "./Errors"

export type ValueControl =
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement

export type TextControl = HTMLInputElement | HTMLTextAreaElement

const clickable = (elem: Element): elem is HTMLElement =>
    typeof (elem as Partial<HTMLElement>).click === "function"

/**
 * Clicks an element. Uses the native `HTMLElement.click()` when available so
 * built-in behaviour (checkbox toggling, form submission, …) is preserved, and
 * falls back to a dispatched `MouseEvent` otherwise.
 */
export const click = (elem: Element): Effect.Effect<void> =>
    Effect.sync(() => {
        if (clickable(elem)) {
            elem.click()
        } else {
            elem.dispatchEvent(
                new MouseEvent("click", {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                }),
            )
        }
    })

export const dispatch = (
    target: EventTarget,
    event: Event,
): Effect.Effect<boolean> => Effect.sync(() => target.dispatchEvent(event))

const setNativeValue = (control: ValueControl, value: string): void => {
    const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(control),
        "value",
    )
    if (descriptor?.set !== undefined) descriptor.set.call(control, value)
    else control.value = value
}

/**
 * Sets a form control's value through the native prototype setter (bypassing
 * framework-installed instance setters that React/Vue use to track changes)
 * and dispatches `input` followed by `change`.
 */
export const setValue = (
    control: ValueControl,
    value: string,
): Effect.Effect<void> =>
    Effect.sync(() => {
        setNativeValue(control, value)
        control.dispatchEvent(
            new Event("input", { bubbles: true, composed: true }),
        )
        control.dispatchEvent(
            new Event("change", { bubbles: true, composed: true }),
        )
    })

export const setInputValue = setValue

const setNativeChecked = (input: HTMLInputElement, checked: boolean): void => {
    const descriptor = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input),
        "checked",
    )
    if (descriptor?.set !== undefined) descriptor.set.call(input, checked)
    else input.checked = checked
}

/**
 * Sets a checkbox/radio's `checked` through the native setter and emits
 * `input` + `change`. A no-op when the value already matches.
 */
export const setChecked = (
    input: HTMLInputElement,
    checked: boolean,
): Effect.Effect<void> =>
    Effect.suspend(() =>
        input.checked === checked
            ? Effect.void
            : Effect.sync(() => {
                  setNativeChecked(input, checked)
                  input.dispatchEvent(
                      new Event("input", { bubbles: true, composed: true }),
                  )
                  input.dispatchEvent(
                      new Event("change", { bubbles: true, composed: true }),
                  )
              }),
    )

export const check = (input: HTMLInputElement): Effect.Effect<void> =>
    setChecked(input, true)

export const uncheck = (input: HTMLInputElement): Effect.Effect<void> =>
    setChecked(input, false)

export const focus = (elem: HTMLElement): Effect.Effect<void> =>
    Effect.sync(() => elem.focus())

export const blur = (elem: HTMLElement): Effect.Effect<void> =>
    Effect.sync(() => elem.blur())

export const submit = (form: HTMLFormElement): Effect.Effect<void> =>
    Effect.sync(() => form.requestSubmit())

export interface ScrollIntoViewOpts {
    readonly behavior?: ScrollBehavior
    readonly block?: ScrollLogicalPosition
    readonly inline?: ScrollLogicalPosition
}

export const scrollIntoView = (
    elem: Element,
    opts: ScrollIntoViewOpts = {},
): Effect.Effect<void> =>
    Effect.sync(() => {
        elem.scrollIntoView({
            block: opts.block ?? "center",
            inline: opts.inline ?? "nearest",
            ...(opts.behavior !== undefined ? { behavior: opts.behavior } : {}),
        })
    })

export const hover = (elem: Element): Effect.Effect<void> =>
    Effect.sync(() => {
        elem.dispatchEvent(
            new MouseEvent("mouseover", { bubbles: true, composed: true }),
        )
        elem.dispatchEvent(new MouseEvent("mouseenter", { composed: true }))
        elem.dispatchEvent(
            new MouseEvent("mousemove", { bubbles: true, composed: true }),
        )
    })

export interface PressOpts {
    readonly code?: string
    readonly location?: number
    readonly repeat?: boolean
    readonly altKey?: boolean
    readonly ctrlKey?: boolean
    readonly metaKey?: boolean
    readonly shiftKey?: boolean
    readonly bubbles?: boolean
    readonly cancelable?: boolean
}

const keyboardInit = (key: string, opts: PressOpts): KeyboardEventInit => ({
    key,
    bubbles: opts.bubbles ?? true,
    cancelable: opts.cancelable ?? true,
    composed: true,
    ...(opts.code !== undefined ? { code: opts.code } : {}),
    ...(opts.location !== undefined ? { location: opts.location } : {}),
    ...(opts.repeat !== undefined ? { repeat: opts.repeat } : {}),
    ...(opts.altKey !== undefined ? { altKey: opts.altKey } : {}),
    ...(opts.ctrlKey !== undefined ? { ctrlKey: opts.ctrlKey } : {}),
    ...(opts.metaKey !== undefined ? { metaKey: opts.metaKey } : {}),
    ...(opts.shiftKey !== undefined ? { shiftKey: opts.shiftKey } : {}),
})

/**
 * Dispatches `keydown`, `keypress` (for printable keys) and `keyup` on `target`.
 * Modifier state can be provided through `opts`.
 */
export const press = (
    target: EventTarget,
    key: string,
    opts: PressOpts = {},
): Effect.Effect<void> =>
    Effect.sync(() => {
        const init = keyboardInit(key, opts)
        target.dispatchEvent(new KeyboardEvent("keydown", init))
        if (key.length === 1)
            target.dispatchEvent(new KeyboardEvent("keypress", init))
        target.dispatchEvent(new KeyboardEvent("keyup", init))
    })

/**
 * Types `text` into a text control one character at a time, appending to the
 * current value and dispatching the key events for each character.
 */
export const type = (control: TextControl, text: string): Effect.Effect<void> =>
    Array.fromIterable(text).reduce(
        (acc, char) =>
            acc.pipe(
                Effect.zipRight(
                    Effect.suspend(() =>
                        setValue(control, control.value + char),
                    ),
                ),
                Effect.zipRight(press(control, char)),
            ),
        Effect.void,
    )

/**
 * Starts media playback, failing with {@link MediaPlayError} when the browser
 * rejects it (e.g. autoplay policy).
 */
export const play = (
    media: HTMLMediaElement,
): Effect.Effect<void, MediaPlayError> =>
    Effect.tryPromise({
        try: () => media.play(),
        catch: reason => new MediaPlayError({ media, reason }),
    })

/**
 * Like {@link play} but ignores rejections, resolving with `true` when playback
 * started and `false` otherwise.
 */
export const safePlay = (media: HTMLMediaElement): Effect.Effect<boolean> =>
    play(media).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
    )

export const pause = (media: HTMLMediaElement): Effect.Effect<void> =>
    Effect.sync(() => media.pause())

export const seek = (
    media: HTMLMediaElement,
    time: number,
): Effect.Effect<void> => Effect.sync(() => (media.currentTime = time))

export const setMuted = (
    media: HTMLMediaElement,
    muted: boolean,
): Effect.Effect<void> => Effect.sync(() => (media.muted = muted))

export const setVolume = (
    media: HTMLMediaElement,
    volume: number,
): Effect.Effect<void> =>
    Effect.sync(() => (media.volume = Math.min(1, Math.max(0, volume))))
