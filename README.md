# Effect Dom

Type-safe DOM manipulation with explicit, composable error handling.

Stop wondering why `querySelector` returned null. Stop casting to types you're not sure about. Effect Dom makes DOM errors explicit but simple to handle. ✨

![Version](https://img.shields.io/npm/v/%40lialh4%2Feffect-dom?style=for-the-badge)
![License](https://img.shields.io/npm/l/%40lialh4%2Feffect-dom?style=for-the-badge)


## Why Effect Dom?

**Explicit errors, zero surprises.** DOM operations fail in predictable ways—selectors can be malformed, elements might not exist, or be the wrong type. Effect Dom surfaces all these errors in your types, while keeping the happy path clean.

### The Problem 😰

```typescript
// Runtime surprises waiting to happen
const audio = document.querySelector("#player") as HTMLAudioElement
audio.play() // 💥 What if it's null? What if it's a <div>?

// Or defensive programming everywhere...
const elem = document.querySelector("#player")
if (!elem) throw new Error("not found")
if (!(elem instanceof HTMLAudioElement)) throw new Error("wrong type")
audio.play()
```

### The Solution ✨

```typescript
import { findElem } from "@lialh4/effect-dom/Elem"
import { Effect } from "effect"

const program = findElem(document, HTMLAudioElement, "#player").pipe(
  Effect.andThen(audio => audio.play())
)

// ✅ All errors are typed and composable
// SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError
```

## Features

✅ **Type-Safe Queries** – Get the exact element type you expect, or fail explicitly.

🔒 **Cross-Origin Aware** – Handle iframe documents safely with proper error types.

🔗 **Composable** – Chain operations naturally with Effect's pipe and error handling.

⚡ **Zero Runtime Overhead** – Thin wrapper over native DOM APIs.

## Quick Example

```typescript
import { Effect } from "effect"
import { findElem } from "@lialh4/effect-dom/Elem"
import { getInnerDoc } from "@lialh4/effect-dom/Doc"

// Find iframe → get its document → find element inside
const program = findElem(document, HTMLIFrameElement, "#my-iframe").pipe(
  Effect.flatMap(getInnerDoc),
  Effect.flatMap(findElem(HTMLButtonElement, ".submit")),
  Effect.andThen(button => button.click())
)

// Handle all possible errors in one place 🎯
Effect.runPromise(program).catch(error => {
  // SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError | CrossOriginError
  console.error(error._tag, error)
})
```

## Installation

```shell
bun add effect-dom
```

Or

```shell
pnpm install effect-dom
```

## License

MIT

## Changelog

### 0.1.0

First version! :tada: