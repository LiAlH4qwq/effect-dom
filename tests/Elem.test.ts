import { Chunk, Effect, Either, Fiber, Option, Stream } from "effect"
import { afterEach, describe, expect, test } from "vitest"
import {
    addedStream,
    addedStreamOn,
    attrStream,
    attrStreamOn,
    child,
    findByText,
    findByTextOn,
    findByTextOpt,
    findByTextOptOn,
    findElem,
    findElemOn,
    findElemOpt,
    findElemOptOn,
    findElemsAll,
    findElemsAllOn,
    findElemsOn,
    getAttr,
    getProp,
    getText,
    hasAttr,
    hasClass,
    isElem,
    isElemExists,
    isElemExistsOn,
    removedStream,
    removedStreamOn,
    waitDetached,
    waitDetachedOn,
    waitElemGone,
    waitElemGoneOn,
    waitElemOn,
    waitElems,
    waitElemsOn,
} from "../src/Elem"

const fork = <A, E>(effect: Effect.Effect<A, E>, mutate: () => void) =>
    Effect.gen(function* () {
        const fiber = yield* Effect.fork(effect)
        yield* Effect.sleep("20 millis")
        mutate()
        return yield* Fiber.join(fiber)
    })

const collectFirst = <A>(stream: Stream.Stream<A>, mutate: () => void) =>
    fork(
        stream.pipe(
            Stream.take(1),
            Stream.runCollect,
            Effect.map(Chunk.toReadonlyArray),
        ),
        mutate,
    )

describe("Elem additions", () => {
    afterEach(() => {
        document.body.innerHTML = ""
    })

    describe("findElemOpt / isElemExists", () => {
        test("none when missing", async () => {
            const result = await Effect.runPromise(
                findElemOpt(document, HTMLAudioElement, "#missing"),
            )
            expect(Option.isNone(result)).toBe(true)
        })

        test("none on type mismatch", async () => {
            const div = document.createElement("div")
            div.id = "wrong"
            document.body.appendChild(div)
            const result = await Effect.runPromise(
                findElemOpt(document, HTMLAudioElement, "#wrong"),
            )
            expect(Option.isNone(result)).toBe(true)
        })

        test("some when present", async () => {
            const audio = document.createElement("audio")
            audio.id = "right"
            document.body.appendChild(audio)
            const result = await Effect.runPromise(
                findElemOpt(document, HTMLAudioElement, "#right"),
            )
            expect(Option.getOrThrow(result)).toBe(audio)
        })

        test("supports the data-last form", async () => {
            const audio = document.createElement("audio")
            audio.id = "data-last"
            document.body.appendChild(audio)
            const result = await Effect.runPromise(
                findElemOpt(HTMLAudioElement, "#data-last")(document),
            )
            expect(Option.getOrThrow(result)).toBe(audio)
        })

        test("isElemExists", async () => {
            const audio = document.createElement("audio")
            document.body.appendChild(audio)
            await expect(
                Effect.runPromise(
                    isElemExists(document, HTMLAudioElement, "audio"),
                ),
            ).resolves.toBe(true)
            await expect(
                Effect.runPromise(
                    isElemExists(document, HTMLVideoElement, "audio"),
                ),
            ).resolves.toBe(false)
        })
    })

    describe("findElemsAll", () => {
        test("empty is allowed", async () => {
            const result = await Effect.runPromise(
                findElemsAll(document, HTMLAudioElement, ".none"),
            )
            expect(result).toStrictEqual([])
        })

        test("skips elements of the wrong type", async () => {
            const audio = document.createElement("audio")
            audio.classList.add("media")
            const div = document.createElement("div")
            div.classList.add("media")
            document.body.append(audio, div)
            const result = await Effect.runPromise(
                findElemsAll(document, HTMLAudioElement, ".media"),
            )
            expect(result).toStrictEqual([audio])
        })
    })

    describe("findByText", () => {
        test("contains match", async () => {
            const button = document.createElement("button")
            button.textContent = "  Sign in now  "
            document.body.appendChild(button)
            const result = await Effect.runPromise(
                findByText(document, HTMLButtonElement, "Sign in"),
            )
            expect(result).toBe(button)
        })

        test("exact match", async () => {
            const button = document.createElement("button")
            button.textContent = "Sign in now"
            document.body.appendChild(button)
            const exact = await Effect.runPromise(
                findByText(document, HTMLButtonElement, "Sign in", {
                    exact: true,
                }).pipe(Effect.either),
            )
            expect(Either.isLeft(exact)).toBe(true)
            const opt = await Effect.runPromise(
                findByTextOpt(document, HTMLButtonElement, "Sign in", {
                    exact: true,
                }),
            )
            expect(Option.isNone(opt)).toBe(true)
        })
    })

    describe("getters", () => {
        test("getText / getAttr / getProp / hasAttr / hasClass", async () => {
            const input = document.createElement("input")
            input.type = "checkbox"
            input.checked = true
            input.setAttribute("data-id", "42")
            input.classList.add("active")
            input.textContent = "hello"
            document.body.appendChild(input)

            const [text, attr, prop, attrPresent, classPresent] =
                await Effect.runPromise(
                    Effect.all([
                        getText(input),
                        getAttr(input, "data-id"),
                        getProp(input, "checked"),
                        hasAttr(input, "data-id"),
                        hasClass(input, "active"),
                    ]),
                )
            expect(text).toBe("hello")
            expect(Option.getOrThrow(attr)).toBe("42")
            expect(prop).toBe(true)
            expect(attrPresent).toBe(true)
            expect(classPresent).toBe(true)
        })
    })

    describe("child", () => {
        test("scopes to direct children", async () => {
            const wrapper = document.createElement("div")
            wrapper.className = "wrapper"
            const nested = document.createElement("div")
            const deep = document.createElement("span")
            deep.className = "item"
            nested.appendChild(deep)
            const direct = document.createElement("span")
            direct.className = "item"
            wrapper.append(nested, direct)
            document.body.appendChild(wrapper)

            const result = await Effect.runPromise(
                findElem(wrapper, HTMLSpanElement, child(".item")),
            )
            expect(result).toBe(direct)
        })
    })

    describe("shadow DOM", () => {
        test("queries inside a ShadowRoot", async () => {
            const host = document.createElement("div")
            const root = host.attachShadow({ mode: "open" })
            const button = document.createElement("button")
            button.id = "shadow-btn"
            root.appendChild(button)
            document.body.appendChild(host)

            const result = await Effect.runPromise(
                findElem(root, HTMLButtonElement, "#shadow-btn"),
            )
            expect(result).toBe(button)
        })
    })

    describe("waitElems", () => {
        test("returns existing list", async () => {
            const a = document.createElement("audio")
            a.className = "track"
            const b = document.createElement("audio")
            b.className = "track"
            document.body.append(a, b)
            const result = await Effect.runPromise(
                waitElems(document, HTMLAudioElement, ".track"),
            )
            expect(result).toStrictEqual([a, b])
        })

        test("waits for the first list", async () => {
            const result = await Effect.runPromise(
                fork(waitElems(document, HTMLAudioElement, ".track"), () => {
                    const a = document.createElement("audio")
                    a.className = "track"
                    document.body.appendChild(a)
                }),
            )
            expect(result).toHaveLength(1)
        })
    })

    describe("waitElemGone", () => {
        test("resolves immediately when absent", async () => {
            await expect(
                Effect.runPromise(waitElemGone(document, ".gone")),
            ).resolves.toBeUndefined()
        })

        test("resolves after removal", async () => {
            const elem = document.createElement("div")
            elem.className = "gone"
            document.body.appendChild(elem)
            await expect(
                Effect.runPromise(
                    fork(waitElemGone(document, ".gone"), () => elem.remove()),
                ),
            ).resolves.toBeUndefined()
        })

        test("detects when a class stops matching", async () => {
            const elem = document.createElement("video")
            elem.className = "vjs-tech"
            document.body.appendChild(elem)
            await expect(
                Effect.runPromise(
                    fork(waitDetached(document, "video.vjs-tech"), () =>
                        elem.classList.remove("vjs-tech"),
                    ),
                ),
            ).resolves.toBeUndefined()
        })
    })

    describe("xxxOn variants", () => {
        const audio = () => {
            const elem = document.createElement("audio")
            elem.className = "on-target"
            return elem
        }

        test("findElemOn", async () => {
            const elem = audio()
            document.body.appendChild(elem)
            const result = await Effect.runPromise(
                findElemOn(document, HTMLAudioElement)(".on-target"),
            )
            expect(result).toBe(elem)
        })

        test("findElemOptOn", async () => {
            const result = await Effect.runPromise(
                findElemOptOn(document, HTMLAudioElement)(".missing"),
            )
            expect(Option.isNone(result)).toBe(true)
        })

        test("isElemExistsOn", async () => {
            document.body.appendChild(audio())
            const result = await Effect.runPromise(
                isElemExistsOn(document, HTMLAudioElement)(".on-target"),
            )
            expect(result).toBe(true)
        })

        test("findElemsOn", async () => {
            const elem = audio()
            document.body.appendChild(elem)
            const result = await Effect.runPromise(
                findElemsOn(document, HTMLAudioElement)(".on-target"),
            )
            expect(result).toStrictEqual([elem])
        })

        test("findElemsAllOn", async () => {
            const result = await Effect.runPromise(
                findElemsAllOn(document, HTMLAudioElement)(".missing"),
            )
            expect(result).toStrictEqual([])
        })

        test("findByTextOn / findByTextOptOn", async () => {
            const button = document.createElement("button")
            button.textContent = "Continue"
            document.body.appendChild(button)
            const found = await Effect.runPromise(
                findByTextOn(document, HTMLButtonElement)("Continue", {
                    exact: true,
                }),
            )
            expect(found).toBe(button)
            const opt = await Effect.runPromise(
                findByTextOptOn(document, HTMLButtonElement)("Continue", {
                    exact: true,
                }),
            )
            expect(Option.getOrThrow(opt)).toBe(button)
        })

        test("waitElemOn", async () => {
            const result = await Effect.runPromise(
                fork(waitElemOn(document, HTMLAudioElement)(".on-target"), () =>
                    document.body.appendChild(audio()),
                ),
            )
            expect(result).toBeInstanceOf(HTMLAudioElement)
        })

        test("waitElemsOn", async () => {
            const result = await Effect.runPromise(
                fork(
                    waitElemsOn(document, HTMLAudioElement)(".on-target"),
                    () => document.body.appendChild(audio()),
                ),
            )
            expect(result).toHaveLength(1)
        })

        test("waitElemGoneOn / waitDetachedOn", async () => {
            const elem = audio()
            document.body.appendChild(elem)
            await expect(
                Effect.runPromise(
                    fork(waitElemGoneOn(document)(".on-target"), () =>
                        elem.remove(),
                    ),
                ),
            ).resolves.toBeUndefined()
            const other = audio()
            document.body.appendChild(other)
            await expect(
                Effect.runPromise(
                    fork(waitDetachedOn(document)(".on-target"), () =>
                        other.remove(),
                    ),
                ),
            ).resolves.toBeUndefined()
        })
    })

    describe("realm-safe matching", () => {
        test("resolves a foreign constructor by name", () => {
            class ForeignHTMLAudioElement {}
            Object.defineProperty(ForeignHTMLAudioElement, "name", {
                value: "HTMLAudioElement",
            })
            const elem = document.createElement("audio")
            document.body.appendChild(elem)
            expect(
                isElem(
                    elem,
                    ForeignHTMLAudioElement as unknown as typeof HTMLAudioElement,
                ),
            ).toBe(true)
        })

        test("rejects a foreign constructor for the wrong tag", () => {
            class ForeignHTMLVideoElement {}
            Object.defineProperty(ForeignHTMLVideoElement, "name", {
                value: "HTMLVideoElement",
            })
            const elem = document.createElement("audio")
            document.body.appendChild(elem)
            expect(
                isElem(
                    elem,
                    ForeignHTMLVideoElement as unknown as typeof HTMLVideoElement,
                ),
            ).toBe(false)
        })
    })

    describe("streams", () => {
        test("addedStream emits matching additions", async () => {
            const result = await Effect.runPromise(
                collectFirst(addedStream(document, ".stream-item"), () => {
                    const div = document.createElement("div")
                    div.className = "stream-item"
                    document.body.appendChild(div)
                }),
            )
            expect(result).toHaveLength(1)
            expect(result[0]).toBeInstanceOf(HTMLDivElement)
        })

        test("addedStream (data-last) via addedStreamOn", async () => {
            const result = await Effect.runPromise(
                collectFirst(addedStreamOn(document)(".stream-item"), () => {
                    const div = document.createElement("div")
                    div.className = "stream-item"
                    document.body.appendChild(div)
                }),
            )
            expect(result).toHaveLength(1)
        })

        test("removedStream emits matching removals", async () => {
            const elem = document.createElement("div")
            elem.className = "stream-item"
            document.body.appendChild(elem)
            const result = await Effect.runPromise(
                collectFirst(removedStream(document, ".stream-item"), () =>
                    elem.remove(),
                ),
            )
            expect(result).toStrictEqual([elem])
        })

        test("removedStreamOn", async () => {
            const elem = document.createElement("div")
            elem.className = "stream-item"
            document.body.appendChild(elem)
            const result = await Effect.runPromise(
                collectFirst(removedStreamOn(document)(".stream-item"), () =>
                    elem.remove(),
                ),
            )
            expect(result).toStrictEqual([elem])
        })

        test("attrStream emits attribute changes", async () => {
            const elem = document.createElement("div")
            elem.className = "stream-item"
            elem.setAttribute("data-state", "idle")
            document.body.appendChild(elem)
            const result = await Effect.runPromise(
                collectFirst(
                    attrStream(document, ".stream-item", "data-state"),
                    () => elem.setAttribute("data-state", "ready"),
                ),
            )
            expect(result).toHaveLength(1)
            expect(result[0]).toMatchObject({
                target: elem,
                name: "data-state",
                value: "ready",
                oldValue: "idle",
            })
        })

        test("attrStreamOn", async () => {
            const elem = document.createElement("div")
            elem.className = "stream-item"
            document.body.appendChild(elem)
            const result = await Effect.runPromise(
                collectFirst(
                    attrStreamOn(document)(".stream-item", "data-state"),
                    () => elem.setAttribute("data-state", "ready"),
                ),
            )
            expect(result).toHaveLength(1)
        })
    })
})
