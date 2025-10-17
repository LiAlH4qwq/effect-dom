import { describe, expect, test } from "bun:test"
import { elemIs, findElem } from "../src/Elem"
import { Effect } from "effect"

describe("test elemIs", () => {
    test("test is div a audio", () => {
        const elem = document.createElement("div")
        expect(elemIs(elem, HTMLAudioElement)).toBe(false)
    })
    test("test is audio a audio", () => {
        const elem = document.createElement("audio")
        expect(elemIs(elem, HTMLAudioElement)).toBe(true)
    })
})

describe("test findElem", () => {
    test("test finding with misformed selector", () => {
        expect(findElem(document, Element, "?").pipe(Effect.runSync)).toBe(
            Effect.succeed(true),
        )
    })
})
