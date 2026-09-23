# Interact

**Languages:** [English](./interact.md) · [简体中文](../zh/interact.md) · [Index](./README.md)

Actions on elements and media, expressed as `Effect`s. All are thin wrappers
around native DOM calls, so they compose with queries and waits.

```ts
import { Effect } from "effect"
import * as Interact from "@lialh4/effect-dom/Interact"
```

## Clicking

| Function                        | Returns             | Behaviour                                                  |
| ------------------------------- | ------------------- | ---------------------------------------------------------- |
| `click(elem)`                   | `Effect<void>`      | Native `HTMLElement.click()`, else a dispatched `MouseEvent`. |
| `clickIfActionable(elem, opts?)`| `Effect<boolean>`   | Clicks only if actionable; `false` when skipped.           |
| `dispatch(target, event)`       | `Effect<boolean>`   | `dispatchEvent`; `false` when cancelled.                   |

`clickIfActionable` never waits. Pair it with `Wait.waitActionable` when the
element may appear or change later:

```ts
import { waitActionable } from "@lialh4/effect-dom/Wait"

yield* waitActionable(document, ".vjs-big-play-button").pipe(
  Effect.flatMap(Interact.clickIfActionable),
)
```

## Forms

| Function                     | Returns        |
| ---------------------------- | -------------- |
| `setValue(control, value)`   | `Effect<void>` |
| `setInputValue`              | alias of `setValue` |
| `setChecked(input, checked)` | `Effect<void>` |
| `check(input)` / `uncheck(input)` | `Effect<void>` |
| `submit(form)`               | `Effect<void>` |

`ValueControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement`.

`setValue` writes through the **prototype** `value` setter (bypassing the
instance setter React/Vue install to track changes) and dispatches `input`
followed by `change`, so controlled components actually update:

```ts
const email = yield* findElem(document, HTMLInputElement, "input[type=email]")
yield* Interact.setValue(email, "me@example.com")

const accept = yield* findElem(document, HTMLInputElement, "#tos")
yield* Interact.check(accept)
```

`setChecked`/`check`/`uncheck` use the same technique on `checked` and are
no-ops when the value already matches.

## Focus, pointer and scrolling

```ts
Interact.focus(elem): Effect<void>
Interact.blur(elem): Effect<void>
Interact.hover(elem): Effect<void>            // mouseover + mouseenter + mousemove
Interact.scrollIntoView(elem, opts?): Effect<void>
```

`ScrollIntoViewOpts` is `{ behavior?, block?, inline? }` and defaults to
`{ block: "center", inline: "nearest" }`.

## Keyboard

```ts
interface PressOpts {
  readonly code?: string
  readonly location?: number
  readonly repeat?: boolean
  readonly altKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly shiftKey?: boolean
  readonly bubbles?: boolean
  readonly cancelable?: boolean
}

Interact.press(target, key, opts?): Effect<void>
Interact.type(control, text): Effect<void>
```

`press` dispatches `keydown`, `keypress` (printable keys only) and `keyup`.
`type` appends `text` to a text control one character at a time, firing the key
events for each character.

```ts
yield* Interact.press(email, "Enter", { ctrlKey: true })
yield* Interact.type(email, " more")
```

## Media controls

| Function                          | Returns                          |
| --------------------------------- | -------------------------------- |
| `play(media)`                     | `Effect<void, MediaPlayError>`   |
| `safePlay(media)`                 | `Effect<boolean>`                |
| `pause(media)`                    | `Effect<void>`                   |
| `seek(media, time)`               | `Effect<void>`                   |
| `setMuted(media, muted)`          | `Effect<void>`                   |
| `setVolume(media, volume)`        | `Effect<void>`                   |
| `setPlaybackRate(media, rate)`    | `Effect<void>`                   |

`play` fails with `MediaPlayError` when the browser rejects playback (autoplay
policy); `safePlay` swallows the rejection and resolves `true`/`false`.
`setVolume` clamps to `0..1`.

For long-running playback — readiness, stall detection and re-applying settings
when a site resets them — use the [Media](./media.md) module.

## Gotchas

- `click` on a `display:none` element is a silent no-op in the browser; use
  `clickIfActionable` or `waitActionable` to detect it.
- `type` dispatches real key events but does not emulate IME or autocomplete.
- `play` needs a user gesture in most browsers; `safePlay` is the pragmatic
  choice inside a content script.
