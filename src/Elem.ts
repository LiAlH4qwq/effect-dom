import { Array, Effect, Option, Stream } from "effect"
import type { NonEmptyArray } from "effect/Array"
import { dual } from "effect/Function"
import {
    ElemNotFoundError,
    ElemTypeMismatchError,
    SelSyntaxError,
} from "./Errors"
import { mutStream } from "./Mut"
import type { ElemCons } from "./Types"

export const elemIs: {
    <E extends Element>(what: ElemCons<E>): (elem: Element) => elem is E
    <E extends Element>(elem: Element, what: ElemCons<E>): elem is E
} = dual(
    2,
    <E extends Element>(elem: Element, what: ElemCons<E>): elem is E => {
        if (elem instanceof what) return true
        if (elem.tagName !== what.name) return false
        const maybeWindowOfElem = elem.ownerDocument.defaultView
        if (maybeWindowOfElem === null) return false
        return (
            elem instanceof
            maybeWindowOfElem[what.name as keyof typeof maybeWindowOfElem]
        )
    },
)

export const findElem: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (
        on: Element | Document,
    ) => Effect.Effect<
        E,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
    <E extends Element>(
        on: Element | Document,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<
        E,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
} = dual(
    3,
    <E extends Element>(
        on: Element | Document,
        what: ElemCons<E>,
        sel: string,
    ) =>
        Effect.try({
            try: () => on.querySelector(sel),
            catch: _ => new SelSyntaxError({ sel }),
        }).pipe(
            Effect.filterOrFail(
                elem => elem !== null,
                _ => new ElemNotFoundError({ sel }),
            ),
            Effect.filterOrFail(
                elem => elemIs(elem, what),
                elem =>
                    new ElemTypeMismatchError({
                        sel,
                        expect: what,
                        actual: [elem.constructor as ElemCons<Element>],
                    }),
            ),
        ),
)

export const findElems: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (
        on: Element | Document,
    ) => Effect.Effect<
        NonEmptyArray<E>,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
    <E extends Element>(
        on: Element | Document,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<
        NonEmptyArray<E>,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
} = dual(
    3,
    <E extends Element>(
        on: Element | Document,
        what: ElemCons<E>,
        sel: string,
    ) =>
        Effect.try({
            try: () => on.querySelectorAll(sel),
            catch: _ => new SelSyntaxError({ sel }),
        }).pipe(
            Effect.filterOrFail(
                elemIt => elemIt.length >= 1,
                _ => new ElemNotFoundError({ sel }),
            ),
            Effect.map(Array.fromIterable),
            Effect.filterOrFail(
                Array.every(elemIs(what)),
                elems =>
                    new ElemTypeMismatchError({
                        sel,
                        expect: what,
                        actual: elems.map(
                            elem => elem.constructor as ElemCons<Element>,
                        ),
                    }),
            ),
        ),
)

export const findElemOn =
    <E extends Element>(on: Element | Document, what: ElemCons<E>) =>
    (sel: string) =>
        findElem(on, what, sel)

export const findElemsOn =
    <E extends Element>(on: Element | Document, what: ElemCons<E>) =>
    (sel: string) =>
        findElems(on, what, sel)

const elemsIn = (node: Node, sel: string): ReadonlyArray<Element> => {
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const elem = node as Element
    const self = elem.matches(sel) ? [elem] : []
    return [...self, ...Array.fromIterable(elem.querySelectorAll(sel))]
}

const addedElems = (
    record: MutationRecord,
    sel: string,
): ReadonlyArray<Element> =>
    Array.fromIterable(record.addedNodes).flatMap(node => elemsIn(node, sel))

export const waitElem: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (
        on: Element | Document,
    ) => Effect.Effect<E, SelSyntaxError | ElemTypeMismatchError>
    <E extends Element>(
        on: Element | Document,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<E, SelSyntaxError | ElemTypeMismatchError>
} = dual(
    3,
    <E extends Element>(
        on: Element | Document,
        what: ElemCons<E>,
        sel: string,
    ) =>
        findElem(on, what, sel).pipe(
            Effect.catchTag("ElemNotFoundError", () =>
                mutStream(on, {
                    targets: [{ _tag: "Child" }],
                    deep: true,
                }).pipe(
                    Stream.flatMap(record =>
                        Stream.fromIterable(addedElems(record, sel)),
                    ),
                    Stream.mapEffect(elem =>
                        elemIs(elem, what)
                            ? Effect.succeed(elem)
                            : Effect.fail(
                                  new ElemTypeMismatchError({
                                      sel,
                                      expect: what,
                                      actual: [
                                          elem.constructor as ElemCons<Element>,
                                      ],
                                  }),
                              ),
                    ),
                    Stream.runHead,
                    Effect.flatMap(
                        Option.match({
                            onNone: () => Effect.never,
                            onSome: Effect.succeed,
                        }),
                    ),
                ),
            ),
        ),
)

export const waitElemOn =
    <E extends Element>(on: Element | Document, what: ElemCons<E>) =>
    (sel: string) =>
        waitElem(on, what, sel)
