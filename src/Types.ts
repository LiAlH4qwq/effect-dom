import type { NonEmptyArray } from "effect/Array"
import type { DurationInput } from "effect/Duration"

export interface ElemCons<E extends Element> {
    new (): E
}

/**
 * Any node that can be used as the root of a query. This includes
 * `Element`, `Document`, `DocumentFragment` (and therefore `ShadowRoot`), so
 * shadow-DOM components can be queried without unwrapping their host.
 */
export type QueryRoot = Element | Document | DocumentFragment

export interface MutObsOpts {
    targets: NonEmptyArray<MutObsTarget>
    deep?: boolean
    /**
     * Only emit records that touch an element matching this selector. A record
     * is kept when its target matches, or when one of the added/removed nodes
     * matches or contains a match.
     */
    selector?: string
    /**
     * Hold records until this much time has passed without a new one. Useful to
     * collapse bursty mutations into a single emission.
     */
    debounce?: DurationInput
}

export type MutObsTarget =
    | MutObsTargetChild
    | MutObsTargetAttr
    | MutObsTargetText

export interface MutObsTargetChild {
    readonly _tag: "Child"
}

export interface MutObsTargetAttr extends MutObsTargetWithOldVal {
    readonly _tag: "Attr"
    /**
     * Restrict observation to these attribute names via `attributeFilter`.
     */
    readonly names?: ReadonlyArray<string>
}

export interface MutObsTargetText extends MutObsTargetWithOldVal {
    readonly _tag: "Text"
}

export interface MutObsTargetWithOldVal {
    readonly withOldVal?: boolean
}

/**
 * A single attribute change emitted by `Elem.attrStream`.
 */
export interface AttrChange {
    readonly target: Element
    readonly name: string
    readonly value: string | null
    readonly oldValue: string | null
}
