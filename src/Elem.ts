import { Effect } from "effect"
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
    <E extends Element>(elem: Element, what: ElemCons<E>): elem is E =>
        elem instanceof what,
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
                        actual: elem.constructor as ElemCons<Element>,
                    }),
            ),
        ),
)
