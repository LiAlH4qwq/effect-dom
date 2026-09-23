import { Effect, Fiber, Option } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
    isActionable,
    isDisabled,
    isMediaEnded,
    isVisible,
    until,
    waitActionable,
    waitAny,
    waitAttr,
    waitClass,
    waitEnabled,
    waitEvent,
    waitFor,
    waitForElement,
    waitInView,
    waitMediaEnded,
    waitStable,
    waitVisible,
} from "../src/Wait"

const fork = <A, E>(effect: Effect.Effect<A, E>, mutate: () => void) =>
    Effect.gen(function* () {
        const fiber = yield* Effect.fork(effect)
        yield* Effect.sleep("20 millis")
        mutate()
        return yield* Fiber.join(fiber)
    })

describe("Wait", () => {
    afterEach(() => {
        document.body.innerHTML = ""
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    test("waitFor polls until the predicate holds", async () => {
        const result = await Effect.runPromise(
            fork(
                waitFor(() => document.querySelector(".later") !== null),
                () => {
                    const div = document.createElement("div")
                    div.className = "later"
                    document.body.appendChild(div)
                },
            ),
        )
        expect(result).toBeUndefined()
    })

    test("waitForElement resolves for an existing element", async () => {
        const div = document.createElement("div")
        div.className = "target"
        document.body.appendChild(div)
        const result = await Effect.runPromise(
            waitForElement(document, ".target"),
        )
        expect(result).toBe(div)
    })

    test("waitForElement observes elements added later", async () => {
        const result = await Effect.runPromise(
            fork(waitForElement(document, ".late"), () => {
                const div = document.createElement("div")
                div.className = "late"
                document.body.appendChild(div)
            }),
        )
        expect(result).toBeInstanceOf(HTMLDivElement)
    })

    test("isVisible reflects computed styles", () => {
        const visible = document.createElement("div")
        document.body.appendChild(visible)
        expect(isVisible(visible)).toBe(true)

        const hidden = document.createElement("div")
        hidden.style.display = "none"
        document.body.appendChild(hidden)
        expect(isVisible(hidden)).toBe(false)
        expect(isVisible(document.createElement("div"))).toBe(false)
    })

    test("isDisabled understands disabled and aria-disabled", () => {
        const button = document.createElement("button")
        expect(isDisabled(button)).toBe(false)
        button.disabled = true
        expect(isDisabled(button)).toBe(true)
        const div = document.createElement("div")
        div.setAttribute("aria-disabled", "true")
        expect(isDisabled(div)).toBe(true)
    })

    test("waitAttr resolves with the value", async () => {
        const div = document.createElement("div")
        div.className = "target"
        document.body.appendChild(div)
        const result = await Effect.runPromise(
            fork(
                waitAttr(document, ".target", "data-state", {
                    equals: "ready",
                }),
                () => {
                    div.setAttribute("data-state", "pending")
                    div.setAttribute("data-state", "ready")
                },
            ),
        )
        expect(result).toBe("ready")
    })

    test("waitClass resolves with the element", async () => {
        const div = document.createElement("div")
        div.className = "target"
        document.body.appendChild(div)
        const result = await Effect.runPromise(
            fork(waitClass(document, ".target", "loaded"), () => {
                div.classList.add("loaded")
            }),
        )
        expect(result).toBe(div)
    })

    test("waitVisible waits for hidden elements to show", async () => {
        const div = document.createElement("div")
        div.className = "target"
        div.style.display = "none"
        document.body.appendChild(div)
        const result = await Effect.runPromise(
            fork(waitVisible(document, ".target"), () => {
                div.style.display = "block"
            }),
        )
        expect(result).toBe(div)
    })

    test("waitEnabled waits for controls to be enabled", async () => {
        const button = document.createElement("button")
        button.className = "target"
        button.disabled = true
        document.body.appendChild(button)
        const result = await Effect.runPromise(
            fork(waitEnabled(document, ".target"), () => {
                button.disabled = false
            }),
        )
        expect(result).toBe(button)
    })

    test("waitEvent resolves with the dispatched event", async () => {
        const target = new EventTarget()
        const event = await Effect.runPromise(
            fork(waitEvent(target, "ping"), () =>
                target.dispatchEvent(new Event("ping")),
            ),
        )
        expect(event.type).toBe("ping")
    })

    test("waitAny resolves with the first winner", async () => {
        const target = new EventTarget()
        const winner = await Effect.runPromise(
            fork(
                waitAny([
                    waitEvent(target, "a").pipe(Effect.as("a")),
                    waitEvent(target, "b").pipe(Effect.as("b")),
                ]),
                () => target.dispatchEvent(new Event("b")),
            ),
        )
        expect(winner).toBe("b")
    })

    test("waitMediaEnded detects a finished track", async () => {
        const media = { ended: false, duration: 10, currentTime: 0 }
        await Effect.runPromise(
            fork(waitMediaEnded(media as unknown as HTMLMediaElement), () => {
                media.currentTime = 10
            }),
        )
        expect(isMediaEnded(media as unknown as HTMLMediaElement)).toBe(true)
    })

    test("waitInView resolves once intersecting", async () => {
        class FakeIntersectionObserver {
            constructor(
                private readonly callback: (
                    entries: Array<{ isIntersecting: boolean }>,
                ) => void,
            ) {}
            observe(): void {
                this.callback([{ isIntersecting: true }])
            }
            disconnect(): void {}
        }
        vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)

        const div = document.createElement("div")
        div.className = "target"
        document.body.appendChild(div)
        const result = await Effect.runPromise(waitInView(document, ".target"))
        expect(result).toBe(div)
    })

    test("until resolves a supplied value immediately", async () => {
        const result = await Effect.runPromise(until(() => Option.some(42)))
        expect(result).toBe(42)
    })

    test("until waits until the value appears", async () => {
        const result = await Effect.runPromise(
            fork(
                until(() => {
                    const elem = document.querySelector(".until")
                    return elem === null ? Option.none() : Option.some(elem)
                }),
                () => {
                    const div = document.createElement("div")
                    div.className = "until"
                    document.body.appendChild(div)
                },
            ),
        )
        expect(result).toBeInstanceOf(HTMLDivElement)
    })

    test("waitStable resolves once the value stops changing", async () => {
        const result = await Effect.runPromise(
            fork(
                waitStable(
                    () => document.body.childElementCount,
                    (previous, next) => previous === next,
                    "30 millis",
                    { interval: "10 millis" },
                ),
                () => document.body.appendChild(document.createElement("div")),
            ),
        )
        expect(result).toBe(1)
    })

    test("isActionable checks visibility, enabledness and coverage", () => {
        const elem = document.createElement("button")
        document.body.appendChild(elem)
        vi.spyOn(elem, "getBoundingClientRect").mockReturnValue({
            width: 10,
            height: 10,
            left: 5,
            top: 5,
            right: 15,
            bottom: 15,
            x: 5,
            y: 5,
            toJSON: () => ({}),
        } as DOMRect)
        vi.spyOn(document, "elementFromPoint").mockReturnValue(elem)
        expect(isActionable(elem)).toBe(true)

        const other = document.createElement("div")
        vi.spyOn(document, "elementFromPoint").mockReturnValue(other)
        expect(isActionable(elem)).toBe(false)
        expect(isActionable(elem, { uncovered: false })).toBe(true)

        elem.style.display = "none"
        expect(isActionable(elem, { uncovered: false })).toBe(false)
    })

    test("waitActionable resolves once the element is actionable", async () => {
        const elem = document.createElement("button")
        document.body.appendChild(elem)
        vi.spyOn(elem, "getBoundingClientRect").mockReturnValue({
            width: 10,
            height: 10,
            left: 5,
            top: 5,
            right: 15,
            bottom: 15,
            x: 5,
            y: 5,
            toJSON: () => ({}),
        } as DOMRect)
        vi.spyOn(document, "elementFromPoint").mockReturnValue(elem)
        const result = await Effect.runPromise(
            waitActionable(document, "button"),
        )
        expect(result).toBe(elem)
    })
})
