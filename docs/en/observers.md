# Observers, iframes, errors and types

**Languages:** [English](./observers.md) · [简体中文](../zh/observers.md) · [Index](./README.md)

Lower-level pieces: raw mutation streams, iframe documents, the error taxonomy
and shared types.

```ts
import { Effect, Stream } from "effect"
import { mutStream } from "@lialh4/effect-dom/Mut"
import { getInnerDoc, waitInnerDoc } from "@lialh4/effect-dom/Doc"
```

## Mutations — `Mut`

```ts
import type { MutObsOpts } from "@lialh4/effect-dom/Types"

interface MutObsOpts {
  targets: NonEmptyArray<MutObsTarget>
  deep?: boolean
  /** Keep only records touching a matching element. */
  selector?: string
  /** Collapse bursts: wait this long with no new record before emitting. */
  debounce?: DurationInput
}

type MutObsTarget =
  | { readonly _tag: "Child" }
  | { readonly _tag: "Attr"; readonly names?: ReadonlyArray<string>; readonly withOldVal?: boolean }
  | { readonly _tag: "Text"; readonly withOldVal?: boolean }

mutStream(target: Node, opts?: MutObsOpts): Stream<MutationRecord>
```

`mutStream` is the resource-managed source of every element stream. It observes
`target` and disconnects when the stream is finalized or the fiber interrupted.

```ts
yield* mutStream(document.body, {
  targets: [{ _tag: "Child" }, { _tag: "Attr", names: ["class"] }],
  deep: true,
  selector: "video.vjs-tech",
  debounce: "100 millis",
}).pipe(
  Stream.runForEach(record => Effect.log(record.type, record.target)),
)
```

- `selector` keeps a record when its target matches, or when an added/removed
  node matches or contains a match.
- `names` maps to `MutationObserver.init.attributeFilter`.
- `withOldVal` maps to `attributeOldValue` / `characterDataOldValue`.

For the common cases prefer the higher-level wrappers in
[Elem § Element streams](./elem.md#element-streams):
`addedStream`, `removedStream`, `attrStream`.

`toMutationObserverInit(opts)` is exported for advanced use; it converts
`MutObsOpts` into a `MutationObserverInit` object.

## Iframes — `Doc`

```ts
getInnerDoc(iframe: HTMLIFrameElement): Effect<Document, CrossOriginError>
waitInnerDoc(iframe: HTMLIFrameElement): Effect<Document, CrossOriginError>
```

`getInnerDoc` reads `iframe.contentDocument` and fails with `CrossOriginError`
when it is `null` (cross-origin). `waitInnerDoc` waits for the frame to finish
loading first, which is the common case right after navigation:

```ts
yield* findElem(document, HTMLIFrameElement, "#player-frame").pipe(
  Effect.flatMap(waitInnerDoc),
  Effect.flatMap(findElem(HTMLVideoElement, "video")),
)
```

## Errors — `Errors`

All errors are `Data.TaggedError` classes, each carrying the context a caller
needs. Nothing is thrown.

| Error                    | Fields                                                       | Raised by                              |
| ------------------------ | ------------------------------------------------------------ | -------------------------------------- |
| `SelSyntaxError`         | `{ sel }`                                                    | Any query with a malformed selector.   |
| `ElemNotFoundError`      | `{ sel }`                                                    | `findElem`, `findElems`, `findByText`. |
| `ElemTypeMismatchError`  | `{ sel, expect, actual }`                                    | `findElem`, `findElems`.               |
| `CrossOriginError`       | `{ iframe }`                                                 | `getInnerDoc`, `waitInnerDoc`.         |
| `MediaPlayError`         | `{ media, reason }`                                          | `Interact.play`.                       |
| `StallError`             | `{ media, reason: "paused" \| "frozen", currentTime, duration }` | `Media.watchStall`.                |

```ts
import { Effect } from "effect"
import { findElem } from "@lialh4/effect-dom/Elem"

findElem(document, HTMLVideoElement, "#player").pipe(
  Effect.catchTags({
    ElemNotFoundError: () => Effect.log("not there"),
    ElemTypeMismatchError: err => Effect.log(err.expect, err.actual),
    SelSyntaxError: err => Effect.log("bad selector", err.sel),
  }),
)
```

## Shared types — `Types`

```ts
type QueryRoot = Element | Document | DocumentFragment
interface ElemCons<E extends Element> { new (): E }
interface AttrChange {
  readonly target: Element
  readonly name: string
  readonly value: string | null
  readonly oldValue: string | null
}
```

`ElemCons<E>` is the "constructor type" used to ask for a typed element, e.g.
`HTMLVideoElement`. Matching resolves it realm-safely (see
[Elem § Realm-safe matching](./elem.md#realm-safe-matching)).

## Resource safety

Everything that observes the DOM is scoped to its `Effect`/`Stream`:

- `mutStream` uses `Effect.acquireRelease`; `disconnect()` runs on finalization.
- `waitEvent` removes its listener on resolution and interruption.
- `waitInView` disconnects its `IntersectionObserver` on interruption.
- `waitElem`, `waitElems`, `waitElemGone` use `mutStream` internally.
- `keepPlaying`/`watchStall` are built on `Stream.tick` and stop on interruption.

Interrupting the fiber is therefore enough — there are no leaked observers.
