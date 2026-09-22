import { Array, Effect, Either, Fiber, Stream } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"
import { waitElem } from "../src/Elem"
import { ElemTypeMismatchError, SelSyntaxError } from "../src/Errors"
import { mutStream } from "../src/Mut"
import type { MutObsOpts } from "../src/Types"

const collectMutations = (target: Node, opts: MutObsOpts, mutate: () => void) =>
    Effect.gen(function* () {
        const fiber = yield* Effect.fork(
            mutStream(target, opts).pipe(
                Stream.take(1),
                Stream.runCollect,
                Effect.map(Array.fromIterable),
            ),
        )
        yield* Effect.sleep("20 millis")
        mutate()
        return yield* Fiber.join(fiber)
    })

const fork = <A, E>(effect: Effect.Effect<A, E>, mutate: () => void) =>
    Effect.gen(function* () {
        const fiber = yield* Effect.fork(effect)
        yield* Effect.sleep("20 millis")
        mutate()
        return yield* Fiber.join(fiber)
    })

describe("Mut", () => {
    afterEach(() => {
        document.body.innerHTML = ""
    })

    describe("mutStream", () => {
        test("childList", async () => {
            const records = await Effect.runPromise(
                collectMutations(
                    document.body,
                    { targets: [{ _tag: "Child" }] },
                    () =>
                        document.body.appendChild(
                            document.createElement("div"),
                        ),
                ),
            )
            expect(records).toHaveLength(1)
            expect(records[0]!.addedNodes).toHaveLength(1)
        })

        test("attributes with old value", async () => {
            const elem = document.createElement("div")
            elem.setAttribute("data-x", "1")
            document.body.appendChild(elem)
            const records = await Effect.runPromise(
                collectMutations(
                    elem,
                    { targets: [{ _tag: "Attr", withOldVal: true }] },
                    () => elem.setAttribute("data-x", "2"),
                ),
            )
            expect(records[0]!.oldValue).toBe("1")
        })

        test("deep subtree", async () => {
            const container = document.createElement("div")
            document.body.appendChild(container)
            const records = await Effect.runPromise(
                collectMutations(
                    container,
                    { targets: [{ _tag: "Child" }], deep: true },
                    () => container.appendChild(document.createElement("span")),
                ),
            )
            expect(records[0]!.addedNodes[0]).toBeInstanceOf(HTMLSpanElement)
        })

        test("disconnects when finalized", async () => {
            const spy = vi.spyOn(MutationObserver.prototype, "disconnect")
            await Effect.runPromise(
                Effect.gen(function* () {
                    const fiber = yield* Effect.fork(
                        mutStream(document.body, {
                            targets: [{ _tag: "Child" }],
                        }).pipe(Stream.take(1), Stream.runDrain),
                    )
                    yield* Effect.sleep("20 millis")
                    document.body.appendChild(document.createElement("div"))
                    yield* Fiber.join(fiber)
                }),
            )
            expect(spy).toHaveBeenCalled()
            spy.mockRestore()
        })
    })

    describe("waitElem", () => {
        test("already present", async () => {
            const audio = document.createElement("audio")
            audio.id = "present"
            document.body.appendChild(audio)
            const result = await Effect.runPromise(
                waitElem(document, HTMLAudioElement, "#present"),
            )
            expect(result).toBe(audio)
        })

        test("added later", async () => {
            const result = await Effect.runPromise(
                fork(waitElem(document, HTMLAudioElement, "#later"), () => {
                    const audio = document.createElement("audio")
                    audio.id = "later"
                    document.body.appendChild(audio)
                }),
            )
            expect(result).toBeInstanceOf(HTMLAudioElement)
            expect(result.id).toBe("later")
        })

        test("matching descendant", async () => {
            const result = await Effect.runPromise(
                fork(
                    waitElem(document, HTMLAudioElement, ".deep-audio"),
                    () => {
                        const wrapper = document.createElement("div")
                        const audio = document.createElement("audio")
                        audio.classList.add("deep-audio")
                        wrapper.appendChild(audio)
                        document.body.appendChild(wrapper)
                    },
                ),
            )
            expect(result).toBeInstanceOf(HTMLAudioElement)
            expect(result.classList.contains("deep-audio")).toBe(true)
        })

        test("invalid selector", async () => {
            const either = await Effect.runPromise(
                waitElem(document, Element, "?").pipe(Effect.either),
            )
            expect(either).toStrictEqual(
                Either.left(new SelSyntaxError({ sel: "?" })),
            )
        })

        test("type mismatch", async () => {
            const either = await Effect.runPromise(
                fork(
                    waitElem(document, HTMLAudioElement, ".wrong").pipe(
                        Effect.either,
                    ),
                    () => {
                        const div = document.createElement("div")
                        div.classList.add("wrong")
                        document.body.appendChild(div)
                    },
                ),
            )
            expect(either).toStrictEqual(
                Either.left(
                    new ElemTypeMismatchError({
                        sel: ".wrong",
                        expect: HTMLAudioElement,
                        actual: [HTMLDivElement],
                    }),
                ),
            )
        })
    })
})
