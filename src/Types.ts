import type { NonEmptyArray } from "effect/Array"

export interface ElemCons<E extends Element> {
    new (): E
}

export interface MutObsOpts {
    targets: NonEmptyArray<MutObsTarget>
    deep?: boolean
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
}

export interface MutObsTargetText extends MutObsTargetWithOldVal {
    readonly _tag: "Text"
}

export interface MutObsTargetWithOldVal {
    readonly withOldVal?: boolean
}
