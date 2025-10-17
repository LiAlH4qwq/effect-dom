import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Either } from "effect"
import { elemIs, findElem } from "../src/Elem"
import {
    ElemNotFoundError,
    ElemTypeMismatchError,
    SelSyntaxError,
} from "../src/Errors"

describe("test elemIs", () => {
    test("test is div not a audio", () => {
        const elem = document.createElement("div")
        expect(elemIs(elem, HTMLAudioElement)).toBe(false)
    })
    test("test is audio a audio", () => {
        const elem = document.createElement("audio")
        expect(elemIs(elem, HTMLAudioElement)).toBe(true)
    })
})

describe("test findElem", () => {
    afterEach(() => {
        document.body.innerHTML = ""
    })
    test("test finding with misformed selector", () => {
        expect(
            findElem(document, Element, "?").pipe(
                Effect.either,
                Effect.runSync,
            ),
        ).toStrictEqual(Either.left(new SelSyntaxError({ sel: "?" })))
    })
    test("test finding non-exist element", () => {
        expect(
            findElem(document, Element, "#non-exist-id").pipe(
                Effect.either,
                Effect.runSync,
            ),
        ).toStrictEqual(
            Either.left(new ElemNotFoundError({ sel: "#non-exist-id" })),
        )
    })
    test("test finding with element type mismatch", () => {
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
                    actual: HTMLDivElement,
                }),
            ),
        )
    })
    test("test finding with broader element type", () => {
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
    test("test finding success", () => {
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
})
