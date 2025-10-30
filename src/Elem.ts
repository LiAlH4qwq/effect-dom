import { Array, Effect } from "effect"
import type { NonEmptyArray } from "effect/Array"
import { dual } from "effect/Function"
import {
    ElemNotFoundError,
    ElemTypeMismatchError,
    SelSyntaxError,
} from "./Errors"
import type { ElemCons } from "./Types"

export const elemIs: {
    <E extends Element>(what: ElemCons<E>): (elem: Element) => elem is E
    <E extends Element>(elem: Element, what: ElemCons<E>): elem is E
} = dual(
    2,
    <E extends Element>(elem: Element, what: ElemCons<E>): elem is E => {
        if (elem instanceof what) return true
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
