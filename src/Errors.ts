import { Data } from "effect"
import type { ElemCons } from "./Types"

export class SelSyntaxError extends Data.TaggedError("SelSyntaxError")<{
    sel: string
}> {}

export class ElemNotFoundError extends Data.TaggedError("ElemNotFoundError")<{
    sel: string
}> {}

export class ElemTypeMismatchError extends Data.TaggedError(
    "ElemTypeMismatchError",
)<{
    sel: string
    expect: ElemCons<Element>
    actual: ElemCons<Element>
}> {}
