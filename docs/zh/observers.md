# 观察器、iframe、错误与类型

**语言：** [English](../en/observers.md) · [简体中文](./observers.md) · [目录](./README.md)

更底层的能力：原始变更流、iframe 文档、错误分类与共享类型。

```ts
import { Effect, Stream } from "effect"
import { mutStream } from "@lialh4/effect-dom/Mut"
import { getInnerDoc, waitInnerDoc } from "@lialh4/effect-dom/Doc"
```

## 变更 —— `Mut`

```ts
import type { MutObsOpts } from "@lialh4/effect-dom/Types"

interface MutObsOpts {
  targets: NonEmptyArray<MutObsTarget>
  deep?: boolean
  /** 仅保留触及匹配元素的记录。 */
  selector?: string
  /** 合并突发：距上一条记录静默这么久后才发射。 */
  debounce?: DurationInput
}

type MutObsTarget =
  | { readonly _tag: "Child" }
  | { readonly _tag: "Attr"; readonly names?: ReadonlyArray<string>; readonly withOldVal?: boolean }
  | { readonly _tag: "Text"; readonly withOldVal?: boolean }

mutStream(target: Node, opts?: MutObsOpts): Stream<MutationRecord>
```

`mutStream` 是所有元素流的资源托管来源。它观察 `target`，并在流结束或 fiber 中断时
断开连接。

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

- `selector`：记录的目标匹配，或其新增/移除节点匹配或包含匹配时保留。
- `names`：映射到 `MutationObserver.init.attributeFilter`。
- `withOldVal`：映射到 `attributeOldValue` / `characterDataOldValue`。

常见场景优先使用 [Elem § 元素流](./elem.md#元素流) 中的高层封装：
`addedStream`、`removedStream`、`attrStream`。

`toMutationObserverInit(opts)` 为高级用法导出，把 `MutObsOpts` 转换为
`MutationObserverInit`。

## iframe —— `Doc`

```ts
getInnerDoc(iframe: HTMLIFrameElement): Effect<Document, CrossOriginError>
waitInnerDoc(iframe: HTMLIFrameElement): Effect<Document, CrossOriginError>
```

`getInnerDoc` 读取 `iframe.contentDocument`，为 `null`（跨域）时以
`CrossOriginError` 失败。`waitInnerDoc` 先等框架加载完成，这正是导航后的常见需求：

```ts
yield* findElem(document, HTMLIFrameElement, "#player-frame").pipe(
  Effect.flatMap(waitInnerDoc),
  Effect.flatMap(findElem(HTMLVideoElement, "video")),
)
```

## 错误 —— `Errors`

所有错误都是 `Data.TaggedError` 类，携带调用方需要的上下文。绝不 `throw`。

| 错误                     | 字段                                                         | 触发者                                 |
| ------------------------ | ------------------------------------------------------------ | -------------------------------------- |
| `SelSyntaxError`         | `{ sel }`                                                    | 任何选择器非法的查询。                 |
| `ElemNotFoundError`      | `{ sel }`                                                    | `findElem`、`findElems`、`findByText`。|
| `ElemTypeMismatchError`  | `{ sel, expect, actual }`                                    | `findElem`、`findElems`。              |
| `CrossOriginError`       | `{ iframe }`                                                 | `getInnerDoc`、`waitInnerDoc`。        |
| `MediaPlayError`         | `{ media, reason }`                                          | `Interact.play`。                      |
| `StallError`             | `{ media, reason: "paused" \| "frozen", currentTime, duration }` | `Media.watchStall`。                |

```ts
import { Effect } from "effect"
import { findElem } from "@lialh4/effect-dom/Elem"

findElem(document, HTMLVideoElement, "#player").pipe(
  Effect.catchTags({
    ElemNotFoundError: () => Effect.log("不存在"),
    ElemTypeMismatchError: err => Effect.log(err.expect, err.actual),
    SelSyntaxError: err => Effect.log("选择器非法", err.sel),
  }),
)
```

## 共享类型 —— `Types`

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

`ElemCons<E>` 是用于请求类型化元素的"构造函数类型"，例如 `HTMLVideoElement`。
匹配时会以 realm 安全的方式解析它（见
[Elem § Realm 安全匹配](./elem.md#realm-安全匹配)）。

## 资源安全

所有观察 DOM 的能力都绑定在其 `Effect`/`Stream` 生命周期上：

- `mutStream` 使用 `Effect.acquireRelease`；结束时执行 `disconnect()`。
- `waitEvent` 在完成与中断时移除监听器。
- `waitInView` 在中断时断开 `IntersectionObserver`。
- `waitElem`、`waitElems`、`waitElemGone` 内部使用 `mutStream`。
- `keepPlaying`/`watchStall` 基于 `Stream.tick`，中断即停止。

因此中断 fiber 就足够了 —— 不会泄漏任何观察器。
