import { Effect, Option, Stream } from "effect"
import type { DurationInput } from "effect/Duration"
import { SelSyntaxError } from "./Errors"
import { mutStream } from "./Mut"
import type { QueryRoot } from "./Types"

export interface WaitOpts {
    /**
     * Delay between predicate checks. Defaults to `"50 millis"`.
     */
    readonly interval?: DurationInput
}

const intervalOf = (opts?: WaitOpts): DurationInput =>
    opts?.interval ?? "50 millis"

const waitForOption = <A>(
    compute: () => Option.Option<A>,
    opts?: WaitOpts,
): Effect.Effect<A> =>
    Effect.suspend(() =>
        Option.match(compute(), {
            onNone: () =>
                Effect.sleep(intervalOf(opts)).pipe(
                    Effect.zipRight(
                        Effect.suspend(() => waitForOption(compute, opts)),
                    ),
                ),
            onSome: Effect.succeed,
        }),
    )

/**
 * Repeatedly evaluates a predicate until it becomes true. The check runs
 * immediately, then every `interval` (50ms by default). Pure and interruptible;
 * unbounded by design, so compose with `Effect.timeout` when you need a limit.
 */
export const waitFor = (
    predicate: () => boolean,
    opts?: WaitOpts,
): Effect.Effect<void> =>
    waitForOption(
        () => (predicate() ? Option.some(undefined) : Option.none()),
        opts,
    ).pipe(Effect.asVoid)

const observeFirst = (
    on: QueryRoot,
    sel: string,
): Effect.Effect<Element, SelSyntaxError> =>
    mutStream(on as Node, {
        targets: [{ _tag: "Child" }],
        deep: true,
    }).pipe(
        Stream.map(() => on.querySelector(sel)),
        Stream.filterMap(Option.fromNullable),
        Stream.runHead,
        Effect.flatMap(
            Option.match({
                onNone: () => Effect.never,
                onSome: Effect.succeed,
            }),
        ),
    )

/**
 * Waits for any element matching `sel` to exist (untyped). Resolves immediately
 * when one is already present, otherwise observes child-list mutations.
 */
export const waitForElement = (
    on: QueryRoot,
    sel: string,
): Effect.Effect<Element, SelSyntaxError> =>
    Effect.try({
        try: () => on.querySelector(sel),
        catch: _ => new SelSyntaxError({ sel }),
    }).pipe(
        Effect.flatMap(maybe =>
            maybe !== null ? Effect.succeed(maybe) : observeFirst(on, sel),
        ),
    )

const pollElement = (
    on: QueryRoot,
    sel: string,
    predicate: (elem: Element) => boolean,
    opts?: WaitOpts,
): Effect.Effect<Element, SelSyntaxError> =>
    waitForElement(on, sel).pipe(
        Effect.zipRight(
            waitForOption(
                () =>
                    Option.fromNullable(on.querySelector(sel)).pipe(
                        Option.filter(predicate),
                    ),
                opts,
            ),
        ),
    )

export interface WaitAttrOpts extends WaitOpts {
    /**
     * Wait until the attribute equals this value, not merely exists.
     */
    readonly equals?: string
}

const attrMatches = (
    elem: Element,
    name: string,
    equals: string | undefined,
): boolean => {
    const value = elem.getAttribute(name)
    return value !== null && (equals === undefined || value === equals)
}

/**
 * Waits until `elem[sel]` carries the attribute `name` (optionally equal to
 * `equals`) and resolves with its value.
 */
export const waitAttr = (
    on: QueryRoot,
    sel: string,
    name: string,
    opts: WaitAttrOpts = {},
): Effect.Effect<string, SelSyntaxError> =>
    pollElement(
        on,
        sel,
        elem => attrMatches(elem, name, opts.equals),
        opts,
    ).pipe(Effect.map(elem => elem.getAttribute(name)!))

/**
 * Waits until `elem[sel]` has the given class and resolves with the element.
 */
export const waitClass = (
    on: QueryRoot,
    sel: string,
    className: string,
    opts: WaitOpts = {},
): Effect.Effect<Element, SelSyntaxError> =>
    pollElement(on, sel, elem => elem.classList.contains(className), opts)

/**
 * Pure visibility check: attached, not `hidden`, and `display`/`visibility`/
 * `opacity` do not hide it. Layout/on-screen checks are covered by
 * {@link waitInView}.
 */
export const isVisible = (elem: Element): boolean => {
    if (!elem.isConnected || (elem as HTMLElement).hidden) return false
    const view = elem.ownerDocument.defaultView
    if (view === null) return true
    const style = view.getComputedStyle(elem)
    return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse" &&
        style.opacity !== "0"
    )
}

/**
 * Waits until `elem[sel]` exists and is visible, resolving with the element.
 */
export const waitVisible = (
    on: QueryRoot,
    sel: string,
    opts: WaitOpts = {},
): Effect.Effect<Element, SelSyntaxError> =>
    pollElement(on, sel, isVisible, opts)

export const isDisabled = (elem: Element): boolean =>
    elem.hasAttribute("disabled") ||
    elem.getAttribute("aria-disabled") === "true"

/**
 * Waits until `elem[sel]` exists and is not disabled, resolving with the element.
 */
export const waitEnabled = (
    on: QueryRoot,
    sel: string,
    opts: WaitOpts = {},
): Effect.Effect<Element, SelSyntaxError> =>
    pollElement(on, sel, elem => !isDisabled(elem), opts)

export const mediaEnded = (media: HTMLMediaElement): boolean =>
    media.ended ||
    (Number.isFinite(media.duration) &&
        media.duration > 0 &&
        media.currentTime >= media.duration)

/**
 * Waits until media playback finished (`ended`, or `currentTime` reached a
 * finite `duration`).
 */
export const waitMediaEnded = (
    media: HTMLMediaElement,
    opts: WaitOpts = {},
): Effect.Effect<void> => waitFor(() => mediaEnded(media), opts)

/**
 * Waits for a single DOM event on `target` and resolves with it. The listener
 * is removed on resolution and on interruption.
 */
export const waitEvent = <T extends Event = Event>(
    target: EventTarget,
    type: string,
    options?: AddEventListenerOptions,
): Effect.Effect<T> =>
    Effect.async<T>(resume => {
        const handler = (event: Event): void => {
            target.removeEventListener(type, handler, options)
            resume(Effect.succeed(event as T))
        }
        target.addEventListener(type, handler, options)
        return Effect.sync(() =>
            target.removeEventListener(type, handler, options),
        )
    })

/**
 * Races several waits and resolves with the first success. Fails with the
 * first error only if every wait fails.
 */
export const waitAny = Effect.raceAll

export interface WaitInViewOpts extends WaitOpts {
    readonly root?: Element | Document | null
    readonly rootMargin?: string
    readonly threshold?: number | Array<number>
}

const intersectionInit = (opts: WaitInViewOpts): IntersectionObserverInit => ({
    ...(opts.root !== undefined ? { root: opts.root } : {}),
    ...(opts.rootMargin !== undefined ? { rootMargin: opts.rootMargin } : {}),
    ...(opts.threshold !== undefined ? { threshold: opts.threshold } : {}),
})

/**
 * Waits until `elem[sel]` exists and intersects the viewport (or `root`),
 * resolving with the element. Falls back to resolving on existence when
 * `IntersectionObserver` is unavailable.
 */
export const waitInView = (
    on: QueryRoot,
    sel: string,
    opts: WaitInViewOpts = {},
): Effect.Effect<Element, SelSyntaxError> =>
    waitForElement(on, sel).pipe(
        Effect.flatMap(elem =>
            Effect.async<Element>(resume => {
                if (typeof IntersectionObserver === "undefined") {
                    resume(Effect.succeed(elem))
                    return
                }
                const observer = new IntersectionObserver(entries => {
                    if (entries.some(entry => entry.isIntersecting)) {
                        observer.disconnect()
                        resume(Effect.succeed(elem))
                    }
                }, intersectionInit(opts))
                observer.observe(elem)
                return Effect.sync(() => observer.disconnect())
            }),
        ),
    )
