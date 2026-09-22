import { Effect, Stream } from "effect"
import type { MutObsOpts, MutObsTarget } from "./Types"

const withOldVal = (
    targets: ReadonlyArray<MutObsTarget>,
    tag: "Attr" | "Text",
): boolean => targets.some(target => target._tag === tag && target.withOldVal)

export const toMutationObserverInit = (
    opts: MutObsOpts,
): MutationObserverInit => {
    const targets = opts.targets
    const hasAttr = targets.some(target => target._tag === "Attr")
    const hasText = targets.some(target => target._tag === "Text")
    const init: MutationObserverInit = {
        subtree: opts.deep ?? false,
        childList: targets.some(target => target._tag === "Child"),
        attributes: hasAttr,
        characterData: hasText,
    }
    if (hasAttr && withOldVal(targets, "Attr")) init.attributeOldValue = true
    if (hasText && withOldVal(targets, "Text"))
        init.characterDataOldValue = true
    return init
}

export const mutStream = (
    target: Node,
    opts: MutObsOpts = { targets: [{ _tag: "Child" }] },
): Stream.Stream<MutationRecord> =>
    Stream.asyncPush<MutationRecord>(
        emit =>
            Effect.acquireRelease(
                Effect.sync(() => {
                    const observer = new MutationObserver(records => {
                        records.forEach(record => {
                            emit.single(record)
                        })
                    })
                    observer.observe(target, toMutationObserverInit(opts))
                    return observer
                }),
                observer => Effect.sync(() => observer.disconnect()),
            ),
        { bufferSize: "unbounded" },
    )
