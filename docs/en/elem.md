# Elem

**Languages:** [English](./elem.md) · [简体中文](../zh/elem.md) · [Index](./README.md)

Query, read, wait for and stream elements. Everything is typed: you ask for an
`HTMLVideoElement` and either get one, get `Option.none()`, or get a typed error.

```ts
import { Effect, Option, Stream } from "effect"
import * as Elem from "@lialh4/effect-dom/Elem"
```

## Query roots

Every query takes a `QueryRoot` as its first argument:

```ts
type QueryRoot = Element | Document | DocumentFragment
```

`ShadowRoot` extends `DocumentFragment`, so shadow-DOM components work unchanged:

```ts
const root = host.shadowRoot
if (root !== null) {
  const confirm = await Effect.runPromise(
    Elem.findElem(root, HTMLButtonElement, ".confirm"),
  )
}
```

## Queries

| Function                                        | Success            | Fails with                                             |
| ----------------------------------------------- | ------------------ | ------------------------------------------------------ |
| `findElem(on, what, sel)`                       | `E`                | `SelSyntaxError \| ElemNotFoundError \| ElemTypeMismatchError` |
| `findElemOpt(on, what, sel)`                    | `Option<E>`        | `SelSyntaxError`                                       |
| `isElemExists(on, what, sel)`                         | `boolean`          | `SelSyntaxError`                                       |
| `findElems(on, what, sel)`                      | `NonEmptyArray<E>` | `SelSyntaxError \| ElemNotFoundError \| ElemTypeMismatchError` |
| `findElemsAll(on, what, sel)`                   | `Array<E>`         | `SelSyntaxError`                                       |
| `findByText(on, what, text, opts?)`             | `E`                | `SelSyntaxError \| ElemNotFoundError`                  |
| `findByTextOpt(on, what, text, opts?)`          | `Option<E>`        | `SelSyntaxError`                                       |

- `findElem` — the fast-fail primitive. `SelSyntaxError` for a bad selector,
  `ElemNotFoundError` when nothing matches, `ElemTypeMismatchError` when the
  match has the wrong type.
- `findElemOpt` — never treats "missing" or "wrong type" as an error.
- `isElemExists` — `findElemOpt` collapsed to a boolean.
- `findElems` — fails when the list is empty or any element has the wrong type.
- `findElemsAll` — skips wrong-typed elements and returns `[]` when nothing
  matches, so "a list page with zero rows" is not an error.
- `findByText` — matches by trimmed `textContent`, substring by default and
  exact with `{ exact: true }`.

```ts
const maybe = yield* Elem.findElemOpt(document, HTMLButtonElement, "#submit")
const has = yield* Elem.isElemExists(document, HTMLButtonElement, "#submit")
const rows = yield* Elem.findElemsAll(document, HTMLTableRowElement, "table tr")
const signIn = yield* Elem.findByText(document, HTMLButtonElement, "Sign in")
```

## Typed getters

| Function                 | Returns            |
| ------------------------ | ------------------ |
| `getText(elem)`          | `Effect<string>`   |
| `getAttr(elem, name)`    | `Effect<Option<string>>` |
| `getProp(elem, key)`     | `Effect<E[K]>`     |
| `hasAttr(elem, name)`    | `Effect<boolean>`  |
| `hasClass(elem, clazz)`  | `Effect<boolean>`  |

```ts
const label = yield* Elem.getText(button)
const href = yield* Elem.getAttr(anchor, "href") // Option<string>
const disabled = yield* Elem.getProp(button, "disabled") // boolean
```

## Selector helper

`child` scopes a selector to direct children, i.e. `:scope > sel`:

```ts
yield* Elem.findElem(root, HTMLElement, Elem.child(".item"))
```

## Waiting for elements

All waits are unbounded; bound them with `Effect.timeout` / `Effect.timeoutFail`.

| Function                             | Success            | Notes                                                  |
| ------------------------------------ | ------------------ | ------------------------------------------------------ |
| `waitElem(on, what, sel)`            | `E`               | Immediate if present; ignores wrong-typed additions.   |
| `waitElems(on, what, sel)`           | `NonEmptyArray<E>` | Resolves with the whole list at once.                  |
| `waitElemGone(on, sel, what?)`       | `void`             | Also fires when an element stops matching (class change). |
| `waitDetached(on, sel, what?)`       | `void`             | Alias of `waitElemGone`.                              |

`waitElem` error channel is only `SelSyntaxError`. If a node matching the
selector is added but has the wrong type, it keeps waiting — safe for
polymorphic selectors like `.player` that may first render as a `<div>`:

```ts
// keeps waiting past `.player` divs until the actual <video> appears
const video = yield* Elem.waitElem(document, HTMLVideoElement, ".player")
```

`waitElemGone` observes both child-list and attribute changes, so an element
that stops matching because a class was removed counts as gone:

```ts
yield* Elem.waitElemGone(document, "video.vjs-tech")
```

## Element streams

Low-level, composable `Stream`s wrapping `MutationObserver`. Never end by
themselves; use `Stream.take`, `Stream.debounce`, `Stream.runForEach`, …

| Stream                              | Emits                      |
| ----------------------------------- | -------------------------- |
| `addedStream(on, sel)`              | `Element` (added)          |
| `removedStream(on, sel)`            | `Element` (removed)        |
| `attrStream(on, sel, name)`         | `AttrChange`               |

```ts
import { Stream } from "effect"

yield* Elem.removedStream(document, ".row").pipe(Stream.take(1), Stream.runDrain)

yield* Elem.attrStream(document, "video.vjs-tech", "class").pipe(
  Stream.tap(change => Effect.log(change.oldValue, "->", change.value)),
  Stream.runDrain,
)
```

`AttrChange` is `{ target: Element; name: string; value: string | null; oldValue: string | null }`.

## Realm-safe matching

`isElem` is the type predicate behind every typed query. It first tries
`instanceof`, then resolves the constructor by name from the element's own
realm, so isolated worlds and subframes match correctly:

```ts
Elem.isElem(elem, HTMLVideoElement) // type guard
```

## Dual and `xxxOn`

Every function in the tables above is `dual` and has an `xxxOn` variant:

```ts
Elem.findElem(document, HTMLVideoElement, "video")
Elem.findElem(HTMLVideoElement, "video")(document)
Elem.findElemOn(document, HTMLVideoElement)("video")
```

`findByText`/`findByTextOpt` are not `dual` (they take `opts` instead of `sel`)
but do have `findByTextOn`/`findByTextOptOn`.

## Gotchas

- `findElem` on a polymorphic selector can fail with `ElemTypeMismatchError`;
  prefer `waitElem` (which ignores wrong types) or `findElemOpt`.
- `findElems` requires **all** matches to have the requested type. When that is
  not guaranteed, use `findElemsAll`.
- `waitElemGone` with no `what` treats any element matching `sel` as present;
  pass `what` to ignore wrong-typed matches.
