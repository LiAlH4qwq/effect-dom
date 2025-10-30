import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Either } from "effect"
import { getInnerDoc } from "../src/Doc"
import { elemIs, findElem, findElems } from "../src/Elem"
import {
    ElemNotFoundError,
    ElemTypeMismatchError,
    SelSyntaxError,
} from "../src/Errors"

describe("test", () => {
    afterEach(() => {
        document.body.innerHTML = ""
    })
    describe("Doc", () => {
        describe("getInnerDoc", () => {
            test("success", () => {
                const ifr = document.createElement("iframe")
                ifr.src = "about:blank"
                document.body.appendChild(ifr)
                expect(
                    getInnerDoc(ifr).pipe(Effect.either, Effect.runSync),
                ).toStrictEqual(Either.right(ifr.contentDocument!))
            })
        })
    })
    describe("Elem", () => {
        describe("elemIs", () => {
            test("is div not a audio", () => {
                const elem = document.createElement("div")
                expect(elemIs(elem, HTMLAudioElement)).toBe(false)
            })
            test("is audio a audio", () => {
                const elem = document.createElement("audio")
                expect(elemIs(elem, HTMLAudioElement)).toBe(true)
            })
        })
        describe("findElem", () => {
            test("misformed selector", () => {
                expect(
                    findElem(document, Element, "?").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.left(new SelSyntaxError({ sel: "?" })))
            })
            test("non-exist element", () => {
                expect(
                    findElem(document, Element, "#non-exist-id").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(
                    Either.left(
                        new ElemNotFoundError({ sel: "#non-exist-id" }),
                    ),
                )
            })
            test("type mismatch", () => {
                const elem = document.createElement("div")
                elem.classList.add("new-class")
                document.body.appendChild(elem)
                expect(
                    findElem(document, HTMLAudioElement, ".new-class").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(
                    Either.left(
                        new ElemTypeMismatchError({
                            sel: ".new-class",
                            expect: HTMLAudioElement,
                            actual: [HTMLDivElement],
                        }),
                    ),
                )
            })
            test("broader type", () => {
                const elem = document.createElement("audio")
                elem.classList.add("new-class")
                document.body.appendChild(elem)
                expect(
                    findElem(document, HTMLElement, ".new-class").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right(elem))
            })
            test("success", () => {
                const elem = document.createElement("audio")
                elem.id = "new-id"
                document.body.appendChild(elem)
                expect(
                    findElem(document, HTMLAudioElement, "#new-id").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right(elem))
            })
            test("type mismatch in iframe", () => {
                const ifr = document.createElement("iframe")
                ifr.src = "about:blank"
                document.body.appendChild(ifr)
                const elem = ifr.contentDocument!.createElement("div")
                elem.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem)
                expect(
                    findElem(document, HTMLIFrameElement, "iframe").pipe(
                        Effect.flatMap(getInnerDoc),
                        Effect.flatMap(
                            findElem(HTMLAudioElement, ".new-class"),
                        ),
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(
                    Either.left(
                        new ElemTypeMismatchError({
                            sel: ".new-class",
                            expect: HTMLAudioElement,
                            actual: [HTMLDivElement],
                        }),
                    ),
                )
            })
            test("borader type in iframe", () => {
                const ifr = document.createElement("iframe")
                ifr.src = "about:blank"
                document.body.appendChild(ifr)
                const elem = ifr.contentDocument!.createElement("audio")
                elem.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem)
                expect(
                    findElem(document, HTMLIFrameElement, "iframe").pipe(
                        Effect.flatMap(getInnerDoc),
                        Effect.flatMap(findElem(HTMLElement, ".new-class")),
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right(elem))
            })
            test("success in iframe", () => {
                const ifr = document.createElement("iframe")
                ifr.src = "about:blank"
                document.body.appendChild(ifr)
                const elem = ifr.contentDocument!.createElement("audio")
                elem.id = "new-id"
                ifr.contentDocument!.body.appendChild(elem)
                expect(
                    findElem(document, HTMLIFrameElement, "iframe").pipe(
                        Effect.flatMap(getInnerDoc),
                        Effect.flatMap(findElem(HTMLAudioElement, "#new-id")),
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right(elem))
            })
        })
        describe("findElems", () => {
            test("misformed selector", () => {
                expect(
                    findElems(document, Element, "?").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.left(new SelSyntaxError({ sel: "?" })))
            })
            test("no elements", () => {
                expect(
                    findElems(document, Element, "#non-exist-id").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(
                    Either.left(
                        new ElemNotFoundError({ sel: "#non-exist-id" }),
                    ),
                )
            })
            test("not all type match", () => {
                const elem1 = document.createElement("audio")
                elem1.classList.add("new-class")
                document.body.appendChild(elem1)
                const elem2 = document.createElement("div")
                elem2.classList.add("new-class")
                document.body.appendChild(elem2)
                const elem3 = document.createElement("audio")
                elem3.classList.add("new-class")
                document.body.appendChild(elem3)
                expect(
                    findElems(document, HTMLAudioElement, ".new-class").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(
                    Either.left(
                        new ElemTypeMismatchError({
                            sel: ".new-class",
                            expect: HTMLAudioElement,
                            actual: [
                                HTMLAudioElement,
                                HTMLDivElement,
                                HTMLAudioElement,
                            ],
                        }),
                    ),
                )
            })
            test("broader type", () => {
                const elem1 = document.createElement("audio")
                elem1.classList.add("new-class")
                document.body.appendChild(elem1)
                const elem2 = document.createElement("div")
                elem2.classList.add("new-class")
                document.body.appendChild(elem2)
                const elem3 = document.createElement("audio")
                elem3.classList.add("new-class")
                document.body.appendChild(elem3)
                expect(
                    findElems(document, HTMLElement, ".new-class").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right([elem1, elem2, elem3]))
            })
            test("success", () => {
                const elem1 = document.createElement("audio")
                elem1.classList.add("new-class")
                document.body.appendChild(elem1)
                const elem2 = document.createElement("audio")
                elem2.classList.add("new-class")
                document.body.appendChild(elem2)
                const elem3 = document.createElement("audio")
                elem3.classList.add("new-class")
                document.body.appendChild(elem3)
                expect(
                    findElems(document, HTMLAudioElement, ".new-class").pipe(
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right([elem1, elem2, elem3]))
            })
            test("not all type match in iframe", () => {
                const ifr = document.createElement("iframe")
                ifr.src = "about:blank"
                document.body.appendChild(ifr)
                const elem1 = ifr.contentDocument!.createElement("audio")
                elem1.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem1)
                const elem2 = ifr.contentDocument!.createElement("div")
                elem2.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem2)
                const elem3 = ifr.contentDocument!.createElement("audio")
                elem3.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem3)
                expect(
                    findElem(document, HTMLIFrameElement, "iframe").pipe(
                        Effect.flatMap(getInnerDoc),
                        Effect.flatMap(
                            findElems(HTMLAudioElement, ".new-class"),
                        ),
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(
                    Either.left(
                        new ElemTypeMismatchError({
                            sel: ".new-class",
                            expect: HTMLAudioElement,
                            actual: [
                                HTMLAudioElement,
                                HTMLDivElement,
                                HTMLAudioElement,
                            ],
                        }),
                    ),
                )
            })
            test("borader type in iframe", () => {
                const ifr = document.createElement("iframe")
                ifr.src = "about:blank"
                document.body.appendChild(ifr)
                const elem1 = ifr.contentDocument!.createElement("audio")
                elem1.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem1)
                const elem2 = ifr.contentDocument!.createElement("div")
                elem2.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem2)
                const elem3 = ifr.contentDocument!.createElement("audio")
                elem3.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem3)
                expect(
                    findElem(document, HTMLIFrameElement, "iframe").pipe(
                        Effect.flatMap(getInnerDoc),
                        Effect.flatMap(findElems(HTMLElement, ".new-class")),
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right([elem1, elem2, elem3]))
            })
            test("success in iframe", () => {
                const ifr = document.createElement("iframe")
                ifr.src = "about:blank"
                document.body.appendChild(ifr)
                const elem1 = ifr.contentDocument!.createElement("audio")
                elem1.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem1)
                const elem2 = ifr.contentDocument!.createElement("audio")
                elem2.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem2)
                const elem3 = ifr.contentDocument!.createElement("audio")
                elem3.classList.add("new-class")
                ifr.contentDocument!.body.appendChild(elem3)
                expect(
                    findElem(document, HTMLIFrameElement, "iframe").pipe(
                        Effect.flatMap(getInnerDoc),
                        Effect.flatMap(
                            findElems(HTMLAudioElement, ".new-class"),
                        ),
                        Effect.either,
                        Effect.runSync,
                    ),
                ).toStrictEqual(Either.right([elem1, elem2, elem3]))
            })
        })
    })
})
