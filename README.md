# Effect Dom

**Languages:** [English](./README.md) · [简体中文](./README.CN.md) · [Documentation](./docs/en/README.md)

**Type-safe, reactive DOM automation — built for browser extensions.**

Does `querySelector` return `null`? Are type assertions guesswork? Are your `setInterval`s leaking? Effect Dom turns every DOM operation into a composable, timeout-able, interruptible `Effect`: failures live in the types, waiting is event-driven, and cleanup is handled by the runtime.

![Version](https://img.shields.io/npm/v/%40lialh4%2Feffect-dom?style=for-the-badge)
![License](https://img.shields.io/npm/l/%40lialh4%2Feffect-dom?style=for-the-badge)

---

## Why browser-extension developers need it

Browser extensions are at their best when they operate on **someone else's page**. But those pages:

- change their markup overnight — today's selector is tomorrow's `null`;
- render asynchronously in SPAs, so elements show up hundreds of milliseconds late;
- hand their inputs to React / Vue, which silently swallow `input.value = "x"`;
- stack third-party scripts, cross-origin iframes and Shadow DOM;
- get navigated away at any moment, while your `MutationObserver` and `setInterval` keep running in the background.

So content scripts tend to look like this:

```ts
// 😰 The old way: probing, cleanup, timeouts and error handling all at once
let tries = 0
const timer = setInterval(() => {
  const el = document.querySelector("video.vjs-tech")
  if (el) {
    clearInterval(timer)
    ;(el as HTMLVideoElement).play().catch(() => {})
  }
  if (++tries > 100) clearInterval(timer) // if you remember to clean up
}, 200)
```

If the page navigates early, the timer becomes a memory leak; if the element is the wrong type, users discover it at runtime.

### The Effect Dom way ✨

```ts
import { Effect } from "effect"
import { waitElem } from "@lialh4/effect-dom/Elem"
import { safePlay } from "@lialh4/effect-dom/Interact"

const program = waitElem(document, HTMLVideoElement, "video.vjs-tech").pipe(
  Effect.timeout("10 seconds"), // Effect owns the timeout
  Effect.flatMap(safePlay), // a rejected play() won't blow up
)

Effect.runPromise(program)
```

The moment the element appears the observer fires and **disconnects itself**; if navigation interrupts the wait, the Effect fiber tears the resource down. No polling, no leaks, no `as`.

---

## Safety is written into the types

Your extension runs on a page you do not control, so **any step can fail**. Effect Dom refuses to turn failure into an exception — it puts failure in the type signature.

| What can go wrong                          | Effect Dom's answer                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| A malformed selector throws                | `SelSyntaxError` (in the type, not thrown)              |
| The element isn't there yet                | `waitElem` waits; `findElemOpt` returns `Option.none()` |
| The element exists but has the wrong type  | `ElemTypeMismatchError`, with expected/actual types     |
| A cross-origin iframe can't be read        | `CrossOriginError`, carrying the offending iframe       |
| Autoplay is rejected                       | `MediaPlayError`, or just ignore it with `safePlay`     |
| Navigation leaks listeners                 | interruption calls `disconnect()`; Effect owns resources |
| The page never satisfies the condition     | close it out with `Effect.timeout` / `Effect.timeoutFail` |

```ts
// Every failure is in the type, so the compiler reminds you to handle it
findElem(document, HTMLVideoElement, "#player")
// Effect<HTMLVideoElement, SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError>
```

### Resources never leak

`waitElem`, `waitInView`, `waitEvent` and `mutStream` register their cleanup through Effect's `acquireRelease` / `async`. When a fiber is interrupted (the user closes the tab, the extension unloads, you call `Fiber.interrupt`), observers and event listeners are released immediately:

```ts
const fiber = Effect.runFork(waitElem(document, HTMLVideoElement, "video"))
// The page moved on and we no longer care:
Effect.runPromise(Fiber.interrupt(fiber)) // MutationObserver disconnects synchronously
```

### Framework-safe form interaction

React / Vue intercept the instance `value` setter to track input. Effect Dom writes through the **native setter on the prototype**, then dispatches `input` / `change`, so controlled components actually react:

```ts
const email = await Effect.runPromise(
  waitElem(document, HTMLInputElement, "input[type=email]"),
)
await Effect.runPromise(setValue(email, "me@example.com"))
```

### Cross-origin, iframes and Shadow DOM are not special cases

A query root (`QueryRoot`) is `Element | Document | DocumentFragment` — and therefore `ShadowRoot` — so shadow-DOM components work unchanged. For iframes there is `waitInnerDoc`, which waits for the frame to finish loading before reading its document:

```ts
findElem(document, HTMLIFrameElement, "#player-frame").pipe(
  Effect.flatMap(waitInnerDoc), // wait for load, then read contentDocument
  Effect.flatMap(findElem(HTMLVideoElement, "video")),
)
```

---

## Efficiency comes from waiting on events, not spinning

**Event-driven, not polled.** `waitElem` / `waitElems` / `waitElemGone` / `waitAttr` / `waitClass` are all backed by `MutationObserver` and wake up the instant an element appears — a single microtask of latency. Polling only happens when you explicitly ask for a state query such as `waitFor(predicate)`, `waitVisible` or `waitEnabled`, at the cadence you choose (50ms by default).

**Mutation streams you can trim.** `mutStream` supports `selector` filtering and `debounce` collapsing, turning an SPA's machine-gun mutations into a single event:

```ts
mutStream(document.body, {
  targets: [{ _tag: "Child" }, { _tag: "Attr", names: ["class"] }],
  deep: true,
  selector: ".item",
  debounce: "150 millis",
}).pipe(
  Stream.runForEach(record => Effect.log(record.type, record.target)),
)
```

**Composition is orchestration.** No more callback pyramids: find → wait → type → play is one `pipe`, every failure short-circuits, and error types can be handled exhaustively.

**Pure functions, zero magic.** The library contains no `let`, no `for` / `while`, no mutable state — just a thin wrapper over native DOM. Behaviour is predictable, the bundle is tree-shakeable, and ESM / CJS / TS types are all provided.

**Testable.** Everything is an ordinary `Effect`, so with `happy-dom` / `jsdom` you can `runPromise` your extension logic and unit-test it like any business code.

---

## Extension cookbook

### 1. Wait for the player, then play

```ts
const program = waitElem(document, HTMLVideoElement, "video.vjs-tech").pipe(
  Effect.timeoutFail({
    duration: "8 seconds",
    onTimeout: () => new Error("the player never showed up"),
  }),
  Effect.flatMap(safePlay),
)
```

### 2. Fill a login form automatically

```ts
import { click, setValue } from "@lialh4/effect-dom/Interact"
import { findByText } from "@lialh4/effect-dom/Elem"

const login = Effect.gen(function* () {
  const email = yield* waitElem(document, HTMLInputElement, "input[type=email]")
  const password = yield* waitElem(
    document,
    HTMLInputElement,
    "input[type=password]",
  )
  yield* setValue(email, "me@example.com")
  yield* setValue(password, "hunter2")

  const submit = yield* findByText(document, HTMLButtonElement, "Sign in")
  yield* click(submit)
})
```

### 3. Wait for something to disappear

```ts
// attribute / class changes count as disappearing, too
yield* waitElemGone(document, "video.vjs-tech")
```

### 4. Wait for media to finish

```ts
yield* waitMediaEnded(video)
// or wait for any event:
yield* waitEvent(video, "ended")
```

### 5. Race several conditions

```ts
const outcome = yield* waitAny([
  waitClass(document, "video.vjs-tech", "vjs-played"),
  waitEvent(video, "error").pipe(Effect.andThen(Effect.fail("playback failed"))),
])
```

### 6. Reach into a Shadow DOM component

```ts
const host = yield* findElem(document, HTMLElement, "my-widget")
const root = host.shadowRoot!
const confirm = yield* findElem(root, HTMLButtonElement, ".confirm")
yield* click(confirm)
```

### 7. Optional queries that don't treat "not found" as an error

```ts
import { isElemExists, findElemOpt, findElemsAll } from "@lialh4/effect-dom/Elem"

const maybeBanner = yield* findElemOpt(document, HTMLElement, ".cookie-banner")
const hasBanner = yield* isElemExists(document, HTMLElement, ".cookie-banner")
const rows = yield* findElemsAll(document, HTMLTableRowElement, "table tr") // [] is fine
```

### 8. Supervise a Video.js player

```ts
import {
  finishMedia,
  endedWithin,
  keepPlaying,
  waitCanPlay,
  watchStall,
} from "@lialh4/effect-dom/Media"

// element exists != playable: with preload="none" readyState stays at 0
yield* waitCanPlay(video, { interval: "100 millis" })

// apps reset muted/resume behind your back; keepPlaying re-applies every tick
// and watchStall fails the whole group the moment playback hangs
yield* Effect.all(
  [keepPlaying(video, { muted: true, playbackRate: 1.5 }), watchStall(video)],
  { concurrency: "unbounded" },
)

// streams that stop ~2s short of duration never fire `ended`
yield* endedWithin(video, 2)
yield* finishMedia(video) // seek to duration to force ended/complete
```

### 9. Wait for data, not just elements

```ts
import { until, waitStable } from "@lialh4/effect-dom/Wait"

// resolve with the first `Some`, no boolean-then-read dance
const firstRow = yield* until(() =>
  Option.fromNullable(document.querySelector(".row")),
)

// wait until a client-rendered list has actually settled
const rowCount = yield* waitStable(
  () => document.querySelectorAll(".row").length,
  (previous, next) => previous === next,
  "300 millis",
)
```

### 10. Only click when it is actually clickable

```ts
import { clickIfActionable } from "@lialh4/effect-dom/Interact"
import { waitActionable } from "@lialh4/effect-dom/Wait"

// visible + enabled + not covered by another element
const playButton = yield* waitActionable(document, ".vjs-big-play-button")
yield* clickIfActionable(playButton)
```

### 11. Stream additions, removals and attributes

```ts
import { addedStream, attrStream, removedStream } from "@lialh4/effect-dom/Elem"
import { Stream } from "effect"

yield* removedStream(document, ".row").pipe(
  Stream.take(1),
  Stream.runDrain,
)
yield* attrStream(document, "video.vjs-tech", "class").pipe(
  Stream.tap(change => Effect.log(change.oldValue, "->", change.value)),
  Stream.runDrain,
)
```

### 12. Realm-safe typed matching

`isElem` first tries `instanceof`, then resolves the constructor by name from the element's **own** realm — so isolated-world content scripts and subframes match correctly:

```ts
// works even though HTMLVideoElement here is from another realm
const frameDoc = yield* waitInnerDoc(frame)
yield* findElem(frameDoc, HTMLVideoElement, "video")
```

---

## Features

- ✅ **Type-safe queries** — get exactly the type you declared, or an explicit error.
- 🔒 **Cross-origin aware** — safe iframe access with fitting error types.
- 🔗 **Composable** — chain with `pipe` and let errors propagate through the types.
- 👀 **Reactive** — raw mutations as a `Stream`; wait for elements, attributes, visibility and media state.
- 🖱️ **Interactive** — click, type, check, press keys, scroll and drive media, all as `Effect`s.
- 🎬 **Media-aware** — readiness, stall detection, tolerant end, force-finish and a keep-playing supervisor.
- 🎯 **Actionable** — wait for, and click, only truly interactable elements.
- 🧩 **Framework-friendly** — native setters plus events, so controlled components respond.
- 🪶 **Zero runtime overhead** — a thin wrapper over native DOM; no mutable state, no loops, no exceptions.

## Modules and API

| Module     | Purpose                   | Key API                                                                                                                            |
| ---------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Elem`     | Query, wait, stream, read | `findElem` `findElemOpt` `isElemExists` `findElemsAll` `findByText` `waitElem` `waitElems` `waitElemGone` `addedStream` `attrStream`     |
| `Wait`     | Wait for state            | `waitFor` `until` `waitStable` `waitAttr` `waitClass` `waitVisible` `waitActionable` `waitEvent` `waitAny` `waitInView`           |
| `Media`    | Supervise playback        | `waitCanPlay` `waitReadyState` `watchStall` `endedWithin` `finishMedia` `keepPlaying`                                              |
| `Interact` | Interact with elements    | `click` `clickIfActionable` `setValue` `check` `press` `type` `scrollIntoView` `safePlay` `seek` …                                 |
| `Mut`      | Observe mutation streams  | `mutStream` (with `selector` / `debounce` / `attributeFilter`)                                                                     |
| `Doc`      | Iframe documents          | `getInnerDoc` `waitInnerDoc`                                                                                                       |
| `Errors`   | Typed errors              | `SelSyntaxError` `ElemNotFoundError` `ElemTypeMismatchError` `CrossOriginError` `MediaPlayError` `StallError`                    |

> Wait APIs are **unbounded by default** (deliberately). Bound them with `Effect.timeout`, or use `Effect.timeoutFail` to get a typed timeout error.

## Documentation

Full guides and API references, in both languages:

- **English** — [index](./docs/en/README.md): [Guide](./docs/en/guide.md) · [Elem](./docs/en/elem.md) · [Wait](./docs/en/wait.md) · [Interact](./docs/en/interact.md) · [Media](./docs/en/media.md) · [Observers & errors](./docs/en/observers.md)
- **简体中文** — [索引](./docs/zh/README.md)：[指南](./docs/zh/guide.md) · [Elem](./docs/zh/elem.md) · [Wait](./docs/zh/wait.md) · [Interact](./docs/zh/interact.md) · [Media](./docs/zh/media.md) · [观察器与错误](./docs/zh/observers.md)

## Installation

```shell
pnpm add @lialh4/effect-dom effect
```

## License

MIT

## Changelog

### Unreleased

- New `Media` module: `waitReadyState`, `waitCanPlay`, `watchStall`, `endedWithin`/`isEndedWithin`, `finishMedia`, `keepPlaying`.
- New `StallError` for paused/frozen playback.
- `Wait.until` (value-returning wait) and `Wait.waitStable` (settle detection) are now public.
- Actionability: `Wait.isActionable`/`waitActionable` and `Interact.clickIfActionable`.
- `Elem.addedStream`, `removedStream`, `attrStream` (dual, with `xxxOn` variants) wrap `mutStream`.
- `isElem` resolves constructors cross-realm, so isolated worlds and subframes match correctly.
- `Interact.setPlaybackRate`.
- `QueryRoot` is now the precise union `Element | Document | DocumentFragment` (still including `ShadowRoot`).
- Predicates renamed for consistency: `elemIs` → `isElem`, `exists`/`existsOn` → `isElemExists`/`isElemExistsOn`, `mediaEnded` → `isMediaEnded`.

### 0.2.0

- `waitElem` now ignores added nodes of the wrong type and fails only on malformed selectors.
- New `Wait` module: `waitFor`, `waitAttr`, `waitClass`, `waitVisible`, `waitEnabled`, `waitMediaEnded`, `waitEvent`, `waitAny`, `waitInView`.
- New `Interact` module: `click`, `setValue`/`setInputValue`, `setChecked`/`check`/`uncheck`, `press`, `type`, `focus`, `blur`, `hover`, `scrollIntoView`, `submit`, `dispatch` and media controls.
- New query helpers: `findElemOpt`, `exists`, `findElemsAll`, `findByText`/`findByTextOpt`, `getText`, `getAttr`, `getProp`, `hasAttr`, `hasClass`, `child`, `waitElems`, `waitElemGone`/`waitDetached`.
- Every `(on, what, sel)` function is `dual` (data-first / data-last) and ships an `xxxOn` variant.
- Query roots now accept any `ParentNode`, including `ShadowRoot`.
- `mutStream` gained `selector` and `debounce` filters and `attributeFilter` names.

### 0.1.1

Fix the example in the README.

### 0.1.0

First release! :tada:
