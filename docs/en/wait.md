# Wait

**Languages:** [English](./wait.md) · [简体中文](../zh/wait.md) · [Index](./README.md)

State predicates and waits that are not plain element insertion: attributes,
classes, visibility, enabledness, actionability, events and media progress.

```ts
import { Effect, Option } from "effect"
import * as Wait from "@lialh4/effect-dom/Wait"
```

## Options

```ts
interface WaitOpts {
  /** Delay between predicate checks. Defaults to "50 millis". */
  readonly interval?: DurationInput
}
```

Waits are **unbounded by default**. Bound them by composing with `Effect`:

```ts
yield* Wait.waitVisible(document, "#overlay").pipe(
  Effect.timeoutFail({
    duration: "5 seconds",
    onTimeout: () => new Error("overlay never appeared"),
  }),
)
```

## Predicate waits

| Function                              | Resolves with | Notes                                                     |
| ------------------------------------- | ------------- | --------------------------------------------------------- |
| `waitFor(predicate, opts?)`           | `void`        | Polls a boolean predicate.                                |
| `until(compute, opts?)`               | `A`           | Value-returning: polls until `compute` returns `Some`.    |
| `waitStable(compute, eq, quiet, opts?)` | `A`         | Resolves once the value is unchanged for `quiet`.         |

```ts
// boolean
yield* Wait.waitFor(() => document.readyState === "complete")

// value-returning
const firstRow = yield* Wait.until(() =>
  Option.fromNullable(document.querySelector(".row")),
)

// settle detection (e.g. a client-rendered list)
const count = yield* Wait.waitStable(
  () => document.querySelectorAll(".row").length,
  (previous, next) => previous === next,
  "300 millis",
)
```

## Element waits

| Function                        | Resolves with | Notes                                             |
| ------------------------------- | ------------- | ------------------------------------------------- |
| `waitForElement(on, sel)`       | `Element`     | Untyped existence wait (observer + poll).         |
| `waitAttr(on, sel, name, opts?)`| `string`      | Waits for the attribute; `{ equals }` for a value.|
| `waitClass(on, sel, clazz, opts?)` | `Element`  | Waits for the class.                              |
| `waitVisible(on, sel, opts?)`   | `Element`     | Attached, not `hidden`, not `display:none`, …     |
| `waitEnabled(on, sel, opts?)`   | `Element`     | Not `disabled`, not `aria-disabled="true"`.       |
| `waitActionable(on, sel, opts?)`| `Element`     | Visible + enabled + not covered.                  |
| `waitInView(on, sel, opts?)`    | `Element`     | `IntersectionObserver` intersecting.              |

```ts
const state = yield* Wait.waitAttr(document, "#player", "data-state", {
  equals: "ready",
})
yield* Wait.waitClass(document, "video.vjs-tech", "vjs-playing")
yield* Wait.waitVisible(document, "#overlay")
yield* Wait.waitEnabled(document, "button[type=submit]")
yield* Wait.waitInView(document, ".vjs-big-play-button")
```

`WaitInViewOpts` accepts `root`, `rootMargin` and `threshold`, exactly like the
native `IntersectionObserver`. When `IntersectionObserver` is unavailable it
falls back to resolving on existence.

## Actionability

```ts
interface ActionableOpts {
  readonly visible?: boolean   // default true
  readonly enabled?: boolean   // default true
  readonly uncovered?: boolean // default true
}

Wait.isActionable(elem, opts?): boolean
Wait.waitActionable(on, sel, opts?): Effect<Element, SelSyntaxError>
```

`isActionable` is a pure check that consults `getComputedStyle`,
`getBoundingClientRect` and `elementFromPoint`; it can only be trusted in a real
layout. Pair it with `Interact.clickIfActionable`:

```ts
import { clickIfActionable } from "@lialh4/effect-dom/Interact"

const button = yield* Wait.waitActionable(document, ".vjs-big-play-button")
yield* clickIfActionable(button)
```

## Events

```ts
// resolve with the next matching event
const ended = yield* Wait.waitEvent(video, "ended")

// build a cancellation signal
const navigation = Wait.waitEvent(window, "popstate")
```

`waitEvent<T>(target, type, options?)` resolves with the event and removes the
listener on resolution **and** on interruption.

## Races

```ts
Wait.waitAny(effects)
```

`waitAny` runs several waits concurrently and resolves with the first success;
it fails only if all of them fail. It is `Effect.raceAll`, so each branch keeps
its own success and error type.

```ts
const outcome = yield* Wait.waitAny([
  Wait.waitClass(document, "video.vjs-tech", "vjs-played"),
  Wait.waitEvent(video, "error"),
])
```

## Media helpers

`Wait` re-exports the two simple media predicates; the richer supervision lives
in [Media](./media.md).

```ts
Wait.isMediaEnded(video): boolean
Wait.waitMediaEnded(video, opts?): Effect<void>
```

## Gotchas

- `isVisible` means "not hidden by CSS/`hidden` and attached" — it does not
  check on-screen geometry. Use `waitInView` for "actually on screen".
- `waitVisible`/`waitEnabled` re-query the selector on every poll, so if the
  element is replaced they follow the replacement.
- `waitStable` needs an equality function; for primitives `(a, b) => a === b`
  is enough.
