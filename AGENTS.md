# Agent Rules for `@lialh4/effect-dom`

These rules are binding for anyone (human or agent) changing this repository.
They encode the four properties the library must always have:

1. **Useful** — cover the frequent DOM needs of browser extensions and userscripts.
2. **Concise** — stay small; every export must earn its place.
3. **Strictly functional** — no imperative control flow, no mutation, no unchecked exceptions.
4. **Strictly safe** — if `pnpm check` and `pnpm test` pass, the public API is total and type-safe.

`pnpm check` runs all of the enforcement below. A change is not done until
`pnpm check && pnpm test` is green.

---

## 1. Strictly functional — hard bans

The following are **forbidden in `src/`**. The audit script
(`scripts/audit-functional.mjs`, run by `pnpm check:functional`) fails the build
on each of them:

| Forbidden                                    | Use instead                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| `for`, `for…in`, `for…of`, `while`, `do`     | `Array.map` / `reduce` / `flatMap`, recursion, `Stream` |
| `let`, `var`                                 | `const` everywhere                                     |
| `.forEach(`, `.push(`, `.sort(`, …           | non-mutating transforms (`map`, `flatMap`, spread)     |
| `try { } catch { }`                          | `Effect.try`, `Effect.tryPromise`, `Effect.either`     |
| `throw`, `new Error(...)`                    | `Data.TaggedError` + `Effect.fail`                     |
| `delete`, `Object.assign`                    | spread / rebuild                                       |
| `Effect.gen`                                 | `Effect` combinators (`pipe`, `flatMap`, `zipRight`, …) |
| non-null assertion `!`                       | narrow or return `Option`                              |

Notes:

- `forEach`/`map`/`reduce`/`flatMap`/`filter` are higher-order functions and are
  fine; a raw `for`/`while` is not.
- `as const` is fine. TypeScript `as SomeType` is **not** a mutation, but see
  section 4 for when casts are allowed.
- Recursion is the blessed way to express a loop; prefer `Effect`/`Stream`
  combinators (`Effect.repeat`, `Stream.tick`, `Stream.scan`) when they fit.

## 2. Strictly safe — total by construction

- **No thrown exceptions cross an API boundary.** Every fallible operation must
  appear in the `Effect` error channel as a `Data.TaggedError`.
- **No non-null assertions.** Model absence with `Option`, or narrow with a real
  check. `biome` enforces this in `src/` (`noNonNullAssertion: error`); `tests/`
  is exempt.
- **Casts require a proof.** A cast is acceptable only immediately after a guard
  that establishes it, and it must carry the reason, e.g. the realm-safe
  `asElement(node)` helper (`nodeType === ELEMENT_NODE`) and the constructor
  lookup in `realmCtor` (function check). Do not cast to silence the compiler.
- **Realm safety.** Never rely on `instanceof` alone: content scripts run in
  isolated worlds and subframes expose different constructors. Use `elemIs`
  (which falls back to resolving the constructor by name from the element's own
  realm) and `asElement` / `Node.nodeType`.
- **Resource safety.** Anything that observes the DOM must release on
  interruption. Use `Effect.acquireRelease` (see `mutStream`) or the cleanup
  returned from `Effect.async` (see `waitEvent`, `waitInView`). No leaked
  `MutationObserver`/`IntersectionObserver`/listeners.
- **No hidden state.** No module-level mutable state, caches, or side effects at
  import time. Functions are pure or return an `Effect`/`Stream`.
- **Prefer `Option` over nullable.** Public helpers that can miss return
  `Option` (`findElemOpt`, `getAttr`) rather than `T | null`.

## 3. Useful and concise — what to add

Add a function only if **all** are true:

1. It is a frequent need when building extensions/userscripts (querying,
   waiting for state, interacting, observing, media).
2. It is generic — no site-specific selectors, no product-specific workflows.
3. It composes with the rest of the library and with `Effect`.
4. It cannot be expressed trivially by composing existing exports.

Reject "too specific" helpers (a particular player's API, a one-off UI widget)
and trivial aliases. When in doubt, leave it out and document the composition.

## 4. API conventions

- **One concern per module**: `Elem` (query / wait / read / element streams),
  `Wait` (state predicates), `Interact` (actions), `Media` (playback
  supervision), `Mut` (raw mutations), `Doc` (iframes), `Errors`, `Types`.
- **`(on, what, sel)` functions must be `dual`** and ship an `xxxOn` variant.
  Add the matching variant to `index` exports, README and tests in the same
  change. Keep this true for every new function of that shape.
- **Boolean predicates are prefixed.** A function that answers a yes/no question
  must read as a predicate: `isVisible`, `isDisabled`, `isActionable`, `isElem`
  (type guard), `isElemExists`, `isMediaEnded`, `isEndedWithin`. Possession uses
  `has` (`hasAttr`, `hasClass`). Never export a bare noun/verb as a predicate.
- **Waits are unbounded by default.** Never add a `timeout` option. Document
  `Effect.timeout` / `Effect.timeoutFail` instead — deadlines and retries belong
  to Effect, and the caller owns the typed error.
- **Errors** are `Data.TaggedError` classes in `src/Errors.ts`, one per failure
  mode, carrying the context a caller needs (`sel`, expected/actual types,
  `iframe`, `media`, …). Current taxonomy: `SelSyntaxError`,
  `ElemNotFoundError`, `ElemTypeMismatchError`, `CrossOriginError`,
  `MediaPlayError`, `StallError`.
- **Side effects only inside `Effect.sync` / `Effect.try` / `Effect.async` /
  `Effect.tryPromise`.** DOM writes are fine there; nothing else executes at
  module scope.
- **Dual/data-last** uses `dual` from `effect/Function`; keep the overload block
  style used in `Elem.ts`.

## 5. Tests — every export is covered

- Every exported function and interface that has behavior needs a test. This
  **includes every `xxxOn` variant**. Do not merge a new export without a test.
- Tests live in `tests/`, run on `vitest` + `happy-dom`. They may use `let`,
  loops, `!` and DOM mutation — the functional bans apply to `src/` only.
- Public behavior changes require updating `README.md`, `README.CN.md` and the
  matching page under `docs/en/` and `docs/zh/` (Features, Modules/API,
  Changelog). Keep the two READMEs and the two `docs/` trees in sync, and keep
  the language-switcher links at the top of each file pointing at the right
  counterpart.
- Keep the CHANGELOG reverse-chronological (`0.2.0`, then `0.1.1`, then `0.1.0`).

## 6. Definition of done

```shell
pnpm check   # functional audit + format + biome lint + tsc
pnpm test    # vitest
pnpm build   # rolldown (esm + cjs + dts)
```

A change is complete only when all three pass, every new export has a test, and
the READMEs are updated. `prepublishOnly` runs `pnpm check && pnpm build`, so a
publish cannot bypass these rules.

## 7. Quick reference

- Enforcement: `scripts/audit-functional.mjs` (AST-based, no false positives from
  comments/strings), `biome.json` (`noNonNullAssertion: error`, `useConst:
  error`, `noUnusedImports: error` for `src/`).
- Reference implementations: `src/Mut.ts` (resource-managed observer stream),
  `src/Wait.ts` (`waitForOption` recursion, `waitStable` via `Stream`),
  `src/Media.ts` (`watchStall`/`keepPlaying` via `Stream.tick`).
- The library contains no `let`, no loops, no `try/catch`, no `throw`, no
  `Effect.gen`, and no non-null assertions — keep it that way.
