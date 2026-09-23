import { Array, Effect, Option, Stream } from "effect"
import type { NonEmptyArray } from "effect/Array"
import { dual } from "effect/Function"
import {
    ElemNotFoundError,
    ElemTypeMismatchError,
    SelSyntaxError,
} from "./Errors"
import { mutStream } from "./Mut"
import type { AttrChange, ElemCons, QueryRoot } from "./Types"

const realmCtor = (
    view: Window,
    what: ElemCons<Element>,
): (new () => Element) | null => {
    const ctor: unknown = Reflect.get(view, what.name)
    return typeof ctor === "function" ? (ctor as new () => Element) : null
}

export const isElem: {
    <E extends Element>(what: ElemCons<E>): (elem: Element) => elem is E
    <E extends Element>(elem: Element, what: ElemCons<E>): elem is E
} = dual(
    2,
    <E extends Element>(elem: Element, what: ElemCons<E>): elem is E => {
        // Same realm: a direct `instanceof` is authoritative.
        if (elem instanceof what) return true
        // Isolated worlds / subframes expose different constructors, so resolve
        // the constructor by name from the element's own realm and re-check.
        const view = elem.ownerDocument.defaultView
        if (view === null) return false
        const ctor = realmCtor(view, what)
        return ctor !== null && elem instanceof ctor
    },
)

const findMatching = <E extends Element>(
    on: QueryRoot,
    what: ElemCons<E>,
    sel: string,
): E | null => {
    const elem = on.querySelector(sel)
    return elem !== null && isElem(elem, what) ? elem : null
}

const queryMatching = <E extends Element>(
    on: QueryRoot,
    what: ElemCons<E>,
    sel: string,
): Array<E> => Array.fromIterable(on.querySelectorAll(sel)).filter(isElem(what))

export const findElem: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (
        on: QueryRoot,
    ) => Effect.Effect<
        E,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
    <E extends Element>(
        on: QueryRoot,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<
        E,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
} = dual(
    3,
    <E extends Element>(on: QueryRoot, what: ElemCons<E>, sel: string) =>
        Effect.try({
            try: () => on.querySelector(sel),
            catch: _ => new SelSyntaxError({ sel }),
        }).pipe(
            Effect.filterOrFail(
                elem => elem !== null,
                _ => new ElemNotFoundError({ sel }),
            ),
            Effect.filterOrFail(
                elem => isElem(elem, what),
                elem =>
                    new ElemTypeMismatchError({
                        sel,
                        expect: what,
                        actual: [elem.constructor as ElemCons<Element>],
                    }),
            ),
        ),
)

/**
 * Like {@link findElem} but returns `Option.none()` instead of failing when no
 * matching element exists (or when the selector matches the wrong type).
 */
export const findElemOpt: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (on: QueryRoot) => Effect.Effect<Option.Option<E>, SelSyntaxError>
    <E extends Element>(
        on: QueryRoot,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<Option.Option<E>, SelSyntaxError>
} = dual(
    3,
    <E extends Element>(on: QueryRoot, what: ElemCons<E>, sel: string) =>
        Effect.try({
            try: () => findMatching(on, what, sel),
            catch: _ => new SelSyntaxError({ sel }),
        }).pipe(Effect.map(Option.fromNullable)),
)

/**
 * Tests for the presence of a matching element without ever failing (except on
 * a malformed selector).
 */
export const isElemExists: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (on: QueryRoot) => Effect.Effect<boolean, SelSyntaxError>
    <E extends Element>(
        on: QueryRoot,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<boolean, SelSyntaxError>
} = dual(
    3,
    <E extends Element>(on: QueryRoot, what: ElemCons<E>, sel: string) =>
        findElemOpt(on, what, sel).pipe(Effect.map(Option.isSome)),
)

export const findElems: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (
        on: QueryRoot,
    ) => Effect.Effect<
        NonEmptyArray<E>,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
    <E extends Element>(
        on: QueryRoot,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<
        NonEmptyArray<E>,
        SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
    >
} = dual(
    3,
    <E extends Element>(on: QueryRoot, what: ElemCons<E>, sel: string) =>
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
                Array.every(isElem(what)),
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

/**
 * Like {@link findElems} but yields every matching element and never fails on
 * an empty (or partially mismatched) result. Elements of the wrong type are
 * skipped, so `[]` is a valid answer.
 */
export const findElemsAll: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (on: QueryRoot) => Effect.Effect<Array<E>, SelSyntaxError>
    <E extends Element>(
        on: QueryRoot,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<Array<E>, SelSyntaxError>
} = dual(
    3,
    <E extends Element>(on: QueryRoot, what: ElemCons<E>, sel: string) =>
        Effect.try({
            try: () => queryMatching(on, what, sel),
            catch: _ => new SelSyntaxError({ sel }),
        }),
)

export interface FindByTextOpts {
    readonly exact?: boolean
}

const textMatches = (elem: Element, text: string, exact: boolean): boolean => {
    const content = (elem.textContent ?? "").trim()
    return exact ? content === text : content.includes(text)
}

const findByTextCandidate = <E extends Element>(
    on: QueryRoot,
    what: ElemCons<E>,
    text: string,
    exact: boolean,
): E | null =>
    Array.fromIterable(on.querySelectorAll("*"))
        .filter(isElem(what))
        .find(elem => textMatches(elem, text, exact)) ?? null

/**
 * Finds the first element of the requested type whose (trimmed) text contains
 * `text` — or equals it when `{ exact: true }` is passed.
 */
export const findByText = <E extends Element>(
    on: QueryRoot,
    what: ElemCons<E>,
    text: string,
    opts: FindByTextOpts = {},
): Effect.Effect<E, SelSyntaxError | ElemNotFoundError> =>
    Effect.try({
        try: () => findByTextCandidate(on, what, text, opts.exact ?? false),
        catch: _ => new SelSyntaxError({ sel: text }),
    }).pipe(
        Effect.flatMap(candidate =>
            candidate === null
                ? Effect.fail(new ElemNotFoundError({ sel: text }))
                : Effect.succeed(candidate),
        ),
    )

export const findByTextOpt = <E extends Element>(
    on: QueryRoot,
    what: ElemCons<E>,
    text: string,
    opts: FindByTextOpts = {},
): Effect.Effect<Option.Option<E>, SelSyntaxError> =>
    Effect.try({
        try: () => findByTextCandidate(on, what, text, opts.exact ?? false),
        catch: _ => new SelSyntaxError({ sel: text }),
    }).pipe(Effect.map(Option.fromNullable))

export const getText = (elem: Element): Effect.Effect<string> =>
    Effect.sync(() => elem.textContent ?? "")

export const getAttr = (
    elem: Element,
    name: string,
): Effect.Effect<Option.Option<string>> =>
    Effect.sync(() => Option.fromNullable(elem.getAttribute(name)))

export const getProp = <E extends Element, K extends keyof E>(
    elem: E,
    key: K,
): Effect.Effect<E[K]> => Effect.sync(() => elem[key])

export const hasAttr = (elem: Element, name: string): Effect.Effect<boolean> =>
    Effect.sync(() => elem.hasAttribute(name))

export const hasClass = (
    elem: Element,
    className: string,
): Effect.Effect<boolean> =>
    Effect.sync(() => elem.classList.contains(className))

/**
 * Builds a selector that only matches direct children of the query root.
 * `findElem(root, Div, child(".item"))` behaves like `root.querySelector(":scope > .item")`.
 */
export const child = (sel: string): string => `:scope > ${sel}`

export const findElemOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (sel: string) =>
        findElem(on, what, sel)

export const findElemsOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (sel: string) =>
        findElems(on, what, sel)

export const findElemOptOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (sel: string) =>
        findElemOpt(on, what, sel)

export const isElemExistsOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (sel: string) =>
        isElemExists(on, what, sel)

export const findElemsAllOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (sel: string) =>
        findElemsAll(on, what, sel)

export const findByTextOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (text: string, opts?: FindByTextOpts) =>
        findByText(on, what, text, opts)

export const findByTextOptOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (text: string, opts?: FindByTextOpts) =>
        findByTextOpt(on, what, text, opts)

const asElement = (node: Node): Element | null =>
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null

const elemsIn = (node: Node, sel: string): ReadonlyArray<Element> => {
    const elem = asElement(node)
    if (elem === null) return []
    const self = elem.matches(sel) ? [elem] : []
    return [...self, ...Array.fromIterable(elem.querySelectorAll(sel))]
}

const addedElems = (
    record: MutationRecord,
    sel: string,
): ReadonlyArray<Element> =>
    Array.fromIterable(record.addedNodes).flatMap(node => elemsIn(node, sel))

const removedElems = (
    record: MutationRecord,
    sel: string,
): ReadonlyArray<Element> =>
    Array.fromIterable(record.removedNodes).flatMap(node => elemsIn(node, sel))

const childStream = (
    on: QueryRoot,
    sel: string,
    elemsOf: (record: MutationRecord, sel: string) => ReadonlyArray<Element>,
): Stream.Stream<Element> =>
    mutStream(on, {
        targets: [{ _tag: "Child" }],
        deep: true,
    }).pipe(Stream.flatMap(record => Stream.fromIterable(elemsOf(record, sel))))

/**
 * Emits every element that starts matching `sel` (the added node itself, or a
 * descendant of it). Never ends; compose with `Stream.take`, `Stream.debounce`,
 * etc.
 */
export const addedStream: {
    (sel: string): (on: QueryRoot) => Stream.Stream<Element>
    (on: QueryRoot, sel: string): Stream.Stream<Element>
} = dual(2, (on: QueryRoot, sel: string) => childStream(on, sel, addedElems))

/**
 * Emits every element that stops matching `sel`.
 */
export const removedStream: {
    (sel: string): (on: QueryRoot) => Stream.Stream<Element>
    (on: QueryRoot, sel: string): Stream.Stream<Element>
} = dual(2, (on: QueryRoot, sel: string) => childStream(on, sel, removedElems))

/**
 * Emits a record for every change of the attribute `name` on elements matching
 * `sel`.
 */
export const attrStream: {
    (sel: string, name: string): (on: QueryRoot) => Stream.Stream<AttrChange>
    (on: QueryRoot, sel: string, name: string): Stream.Stream<AttrChange>
} = dual(3, (on: QueryRoot, sel: string, name: string) =>
    mutStream(on, {
        targets: [{ _tag: "Attr", names: [name], withOldVal: true }],
        deep: true,
    }).pipe(
        Stream.filterMap(record => {
            const target = asElement(record.target)
            if (
                record.attributeName !== name ||
                target === null ||
                !target.matches(sel)
            ) {
                return Option.none()
            }
            return Option.some({
                target,
                name,
                value: target.getAttribute(name),
                oldValue: record.oldValue,
            })
        }),
    ),
)

const observeAddedElem = <E extends Element>(
    on: QueryRoot,
    what: ElemCons<E>,
    sel: string,
): Effect.Effect<E, SelSyntaxError> =>
    mutStream(on, {
        targets: [{ _tag: "Child" }],
        deep: true,
    }).pipe(
        Stream.flatMap(record => Stream.fromIterable(addedElems(record, sel))),
        Stream.filterMap(elem =>
            isElem(elem, what) ? Option.some(elem) : Option.none(),
        ),
        Stream.runHead,
        Effect.flatMap(
            Option.match({
                onNone: () => Effect.never,
                onSome: Effect.succeed,
            }),
        ),
    )

/**
 * Waits for a typed element to appear. It resolves immediately when one already
 * exists, otherwise it observes child-list mutations. Added nodes of the wrong
 * type are ignored rather than failing the wait, which makes polymorphic
 * selectors safe.
 *
 * Waiting is unbounded; compose with `Effect.timeout` (or `Effect.timeoutFail`
 * for a typed timeout error) to bound it.
 */
export const waitElem: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (on: QueryRoot) => Effect.Effect<E, SelSyntaxError>
    <E extends Element>(
        on: QueryRoot,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<E, SelSyntaxError>
} = dual(
    3,
    <E extends Element>(on: QueryRoot, what: ElemCons<E>, sel: string) =>
        Effect.try({
            try: () => findMatching(on, what, sel),
            catch: _ => new SelSyntaxError({ sel }),
        }).pipe(
            Effect.flatMap(maybe =>
                maybe !== null
                    ? Effect.succeed(maybe)
                    : observeAddedElem(on, what, sel),
            ),
        ),
)

const observeNewElems = <E extends Element>(
    on: QueryRoot,
    what: ElemCons<E>,
    sel: string,
): Effect.Effect<NonEmptyArray<E>, SelSyntaxError> =>
    mutStream(on, {
        targets: [{ _tag: "Child" }],
        deep: true,
    }).pipe(
        Stream.map(() => queryMatching(on, what, sel)),
        Stream.filter(Array.isNonEmptyArray),
        Stream.runHead,
        Effect.flatMap(
            Option.match({
                onNone: () => Effect.never,
                onSome: Effect.succeed,
            }),
        ),
    )

/**
 * Waits until at least one matching element exists and returns all of them.
 * Unbounded like {@link waitElem}; compose with `Effect.timeout`.
 */
export const waitElems: {
    <E extends Element>(
        what: ElemCons<E>,
        sel: string,
    ): (on: QueryRoot) => Effect.Effect<NonEmptyArray<E>, SelSyntaxError>
    <E extends Element>(
        on: QueryRoot,
        what: ElemCons<E>,
        sel: string,
    ): Effect.Effect<NonEmptyArray<E>, SelSyntaxError>
} = dual(
    3,
    <E extends Element>(on: QueryRoot, what: ElemCons<E>, sel: string) =>
        Effect.try({
            try: () => queryMatching(on, what, sel),
            catch: _ => new SelSyntaxError({ sel }),
        }).pipe(
            Effect.flatMap(elems =>
                Array.isNonEmptyArray(elems)
                    ? Effect.succeed(elems)
                    : observeNewElems(on, what, sel),
            ),
        ),
)

const notPresent = (
    on: QueryRoot,
    sel: string,
    what?: ElemCons<Element>,
): boolean =>
    what === undefined
        ? on.querySelector(sel) === null
        : Array.fromIterable(on.querySelectorAll(sel)).every(
              elem => !isElem(elem, what),
          )

const observeGone = (
    on: QueryRoot,
    sel: string,
    what?: ElemCons<Element>,
): Effect.Effect<void, SelSyntaxError> =>
    mutStream(on, {
        targets: [{ _tag: "Child" }, { _tag: "Attr" }],
        deep: true,
    }).pipe(
        Stream.filter(() => notPresent(on, sel, what)),
        Stream.runHead,
        Effect.asVoid,
    )

/**
 * Waits until nothing matching `sel` (and optionally `what`) remains under
 * `on`. Attribute changes are observed too, so an element that stops matching
 * because a class was removed counts as gone. Unbounded; compose with
 * `Effect.timeout`.
 */
export const waitElemGone = (
    on: QueryRoot,
    sel: string,
    what?: ElemCons<Element>,
): Effect.Effect<void, SelSyntaxError> =>
    Effect.try({
        try: () => notPresent(on, sel, what),
        catch: _ => new SelSyntaxError({ sel }),
    }).pipe(
        Effect.flatMap(gone =>
            gone ? Effect.void : observeGone(on, sel, what),
        ),
    )

/**
 * Alias for {@link waitElemGone}.
 */
export const waitDetached = waitElemGone

export const waitElemOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (sel: string) =>
        waitElem(on, what, sel)

export const waitElemsOn =
    <E extends Element>(on: QueryRoot, what: ElemCons<E>) =>
    (sel: string) =>
        waitElems(on, what, sel)

export const waitElemGoneOn =
    (on: QueryRoot) => (sel: string, what?: ElemCons<Element>) =>
        waitElemGone(on, sel, what)

export const waitDetachedOn = waitElemGoneOn

export const addedStreamOn = (on: QueryRoot) => (sel: string) =>
    addedStream(on, sel)

export const removedStreamOn = (on: QueryRoot) => (sel: string) =>
    removedStream(on, sel)

export const attrStreamOn = (on: QueryRoot) => (sel: string, name: string) =>
    attrStream(on, sel, name)
