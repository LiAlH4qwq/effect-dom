import { Array, Effect, Stream } from "effect"
import type { DurationInput } from "effect/Duration"
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
    const names = targets.flatMap(target =>
        target._tag === "Attr" && target.names !== undefined
            ? [...target.names]
            : [],
    )
    return {
        subtree: opts.deep ?? false,
        childList: targets.some(target => target._tag === "Child"),
        attributes: hasAttr,
        characterData: hasText,
        ...(hasAttr && withOldVal(targets, "Attr")
            ? { attributeOldValue: true }
            : {}),
        ...(hasText && withOldVal(targets, "Text")
            ? { characterDataOldValue: true }
            : {}),
        ...(names.length > 0 ? { attributeFilter: names } : {}),
    }
}

const nodeMatches = (node: Node, selector: string): boolean =>
    node instanceof Element &&
    (node.matches(selector) || node.querySelector(selector) !== null)

const recordMatches = (record: MutationRecord, selector: string): boolean =>
    (record.target instanceof Element && record.target.matches(selector)) ||
    Array.fromIterable(record.addedNodes).some(node =>
        nodeMatches(node, selector),
    ) ||
    Array.fromIterable(record.removedNodes).some(node =>
        nodeMatches(node, selector),
    )

const filterBySelector =
    (selector?: string) =>
    (stream: Stream.Stream<MutationRecord>): Stream.Stream<MutationRecord> =>
        selector === undefined
            ? stream
            : stream.pipe(
                  Stream.filter(record => recordMatches(record, selector)),
              )

const debounceBy =
    (duration?: DurationInput) =>
    (stream: Stream.Stream<MutationRecord>): Stream.Stream<MutationRecord> =>
        duration === undefined ? stream : stream.pipe(Stream.debounce(duration))

export const mutStream = (
    target: Node,
    opts: MutObsOpts = { targets: [{ _tag: "Child" }] },
): Stream.Stream<MutationRecord> =>
    Stream.asyncPush<MutationRecord>(
        emit =>
            Effect.acquireRelease(
                Effect.sync(() => {
                    const observer = new MutationObserver(records => {
                        emit.array(Array.fromIterable(records))
                    })
                    observer.observe(target, toMutationObserverInit(opts))
                    return observer
                }),
                observer => Effect.sync(() => observer.disconnect()),
            ),
        { bufferSize: "unbounded" },
    ).pipe(filterBySelector(opts.selector), debounceBy(opts.debounce))
