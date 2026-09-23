# Elem

**语言：** [English](../en/elem.md) · [简体中文](./elem.md) · [目录](./README.md)

查询、读取、等待与流式监听元素。一切都是类型化的：你要 `HTMLVideoElement`，
要么拿到它，要么拿到 `Option.none()`，要么拿到类型化错误。

```ts
import { Effect, Option, Stream } from "effect"
import * as Elem from "@lialh4/effect-dom/Elem"
```

## 查询根

每个查询的第一个参数都是 `QueryRoot`：

```ts
type QueryRoot = Element | Document | DocumentFragment
```

`ShadowRoot` 继承自 `DocumentFragment`，所以 Shadow DOM 组件无需特殊处理：

```ts
const root = host.shadowRoot
if (root !== null) {
  const confirm = await Effect.runPromise(
    Elem.findElem(root, HTMLButtonElement, ".confirm"),
  )
}
```

## 查询

| 函数                                       | 成功               | 错误                                                   |
| ------------------------------------------ | ------------------ | ------------------------------------------------------ |
| `findElem(on, what, sel)`                  | `E`                | `SelSyntaxError \| ElemNotFoundError \| ElemTypeMismatchError` |
| `findElemOpt(on, what, sel)`               | `Option<E>`        | `SelSyntaxError`                                       |
| `isElemExists(on, what, sel)`                    | `boolean`          | `SelSyntaxError`                                       |
| `findElems(on, what, sel)`                 | `NonEmptyArray<E>` | `SelSyntaxError \| ElemNotFoundError \| ElemTypeMismatchError` |
| `findElemsAll(on, what, sel)`              | `Array<E>`         | `SelSyntaxError`                                       |
| `findByText(on, what, text, opts?)`        | `E`                | `SelSyntaxError \| ElemNotFoundError`                  |
| `findByTextOpt(on, what, text, opts?)`     | `Option<E>`        | `SelSyntaxError`                                       |

- `findElem` —— 快速失败原语。选择器非法 → `SelSyntaxError`；无匹配 →
  `ElemNotFoundError`；类型不符 → `ElemTypeMismatchError`。
- `findElemOpt` —— 不把"缺失"或"类型不符"当错误。
- `isElemExists` —— 把 `findElemOpt` 折叠为布尔。
- `findElems` —— 列表为空或任一元素类型不符都会失败。
- `findElemsAll` —— 跳过类型不符的元素，无匹配时返回 `[]`，"零行的列表页"不是错误。
- `findByText` —— 按裁剪后的 `textContent` 匹配，默认子串，`{ exact: true }` 精确。

```ts
const maybe = yield* Elem.findElemOpt(document, HTMLButtonElement, "#submit")
const has = yield* Elem.isElemExists(document, HTMLButtonElement, "#submit")
const rows = yield* Elem.findElemsAll(document, HTMLTableRowElement, "table tr")
const signIn = yield* Elem.findByText(document, HTMLButtonElement, "登录")
```

## 类型化 getter

| 函数                     | 返回                     |
| ------------------------ | ------------------------ |
| `getText(elem)`          | `Effect<string>`         |
| `getAttr(elem, name)`    | `Effect<Option<string>>` |
| `getProp(elem, key)`     | `Effect<E[K]>`           |
| `hasAttr(elem, name)`    | `Effect<boolean>`        |
| `hasClass(elem, clazz)`  | `Effect<boolean>`        |

```ts
const label = yield* Elem.getText(button)
const href = yield* Elem.getAttr(anchor, "href") // Option<string>
const disabled = yield* Elem.getProp(button, "disabled") // boolean
```

## 选择器辅助

`child` 把选择器限定到直接子元素，即 `:scope > sel`：

```ts
yield* Elem.findElem(root, HTMLElement, Elem.child(".item"))
```

## 等待元素

所有等待默认无超时，用 `Effect.timeout` / `Effect.timeoutFail` 设限。

| 函数                                 | 成功               | 说明                                                 |
| ------------------------------------ | ------------------ | ---------------------------------------------------- |
| `waitElem(on, what, sel)`            | `E`                | 已存在则立即返回；忽略类型不符的新增节点。          |
| `waitElems(on, what, sel)`           | `NonEmptyArray<E>` | 一次性返回整个列表。                                 |
| `waitElemGone(on, sel, what?)`       | `void`             | 元素不再匹配（含 class 变化）也算消失。              |
| `waitDetached(on, sel, what?)`       | `void`             | `waitElemGone` 的别名。                              |

`waitElem` 的错误通道只有 `SelSyntaxError`。若匹配选择器但类型不符的节点被加入，
它会继续等待 —— 这对 `.player` 这类先渲染成 `<div>` 的多态选择器很安全：

```ts
// 越过 .player 的 div，直到真正的 <video> 出现
const video = yield* Elem.waitElem(document, HTMLVideoElement, ".player")
```

`waitElemGone` 同时观察子节点与属性变化，因此元素因 class 被移除而不再匹配也算消失：

```ts
yield* Elem.waitElemGone(document, "video.vjs-tech")
```

## 元素流

基于 `MutationObserver` 的低层、可组合 `Stream`。它们不会自行结束，请配合
`Stream.take`、`Stream.debounce`、`Stream.runForEach` 等使用。

| 流                              | 发射                    |
| ------------------------------- | ----------------------- |
| `addedStream(on, sel)`          | `Element`（新增）       |
| `removedStream(on, sel)`        | `Element`（移除）       |
| `attrStream(on, sel, name)`     | `AttrChange`            |

```ts
import { Stream } from "effect"

yield* Elem.removedStream(document, ".row").pipe(Stream.take(1), Stream.runDrain)

yield* Elem.attrStream(document, "video.vjs-tech", "class").pipe(
  Stream.tap(change => Effect.log(change.oldValue, "->", change.value)),
  Stream.runDrain,
)
```

`AttrChange` 为 `{ target: Element; name: string; value: string | null; oldValue: string | null }`。

## Realm 安全匹配

`isElem` 是所有类型化查询背后的类型谓词。它先尝试 `instanceof`，再按名字从元素
自身所在 realm 解析构造函数，因此隔离世界与子框架都能正确匹配：

```ts
Elem.isElem(elem, HTMLVideoElement) // 类型守卫
```

## dual 与 `xxxOn`

上表中每个函数都是 `dual`，且都有 `xxxOn` 变体：

```ts
Elem.findElem(document, HTMLVideoElement, "video")
Elem.findElem(HTMLVideoElement, "video")(document)
Elem.findElemOn(document, HTMLVideoElement)("video")
```

`findByText`/`findByTextOpt` 不是 `dual`（第三参是 `opts` 而非 `sel`），
但有 `findByTextOn`/`findByTextOptOn`。

## 注意事项

- 多态选择器上的 `findElem` 可能以 `ElemTypeMismatchError` 失败；优先用
  `waitElem`（忽略类型不符）或 `findElemOpt`。
- `findElems` 要求**所有**匹配项都是请求的类型；无法保证时用 `findElemsAll`。
- `waitElemGone` 不传 `what` 时，任何匹配 `sel` 的元素都算存在；传 `what`
  可忽略类型不符的匹配。
