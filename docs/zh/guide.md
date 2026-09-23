# 指南

**语言：** [English](../en/guide.md) · [简体中文](./guide.md) · [目录](./README.md)

本指南介绍安装、API 形态，以及你会搭配使用的 `Effect` 模式。

## 安装

```shell
pnpm add @lialh4/effect-dom effect
```

`effect` 是对等依赖。库同时提供 ESM、CJS 与 `.d.ts`，自身无运行时依赖。

## 导入：桶文件或按模块

所有模块既能从包根导入，也能按子路径导入（更利于 tree-shaking）：

```ts
// 桶文件
import { Elem, Wait, Interact, Media } from "@lialh4/effect-dom"

// 子路径
import { findElem, waitElem } from "@lialh4/effect-dom/Elem"
import { waitAttr, waitActionable } from "@lialh4/effect-dom/Wait"
import { click, setValue } from "@lialh4/effect-dom/Interact"
import { waitCanPlay, keepPlaying } from "@lialh4/effect-dom/Media"
import { mutStream } from "@lialh4/effect-dom/Mut"
import { getInnerDoc, waitInnerDoc } from "@lialh4/effect-dom/Doc"
import { ElemNotFoundError } from "@lialh4/effect-dom/Errors"
```

## Content script（MV3）与用户脚本

Content script 以经典脚本加载，发布前需要打包：

```ts
// content.ts（由 vite/rollup/esbuild/rolldown 打包）
import { Effect } from "effect"
import { waitElem } from "@lialh4/effect-dom/Elem"
import { safePlay } from "@lialh4/effect-dom/Interact"

const main = waitElem(document, HTMLVideoElement, "video").pipe(
  Effect.flatMap(safePlay),
)

Effect.runPromise(main)
```

`manifest.json`：

```json
{
  "manifest_version": 3,
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }]
}
```

导入本库不会在模块作用域执行任何副作用。

## 心智模型

所有公开 API 返回 `Effect<A, E, R>` 或 `Stream<A, E, R>`：

- `A` —— 成功时得到的值。
- `E` —— 必须处理的**类型化错误**。API 边界绝不 `throw`。
- `R` —— 需要的服务；纯 DOM 辅助函数不需要任何服务。

```ts
import { findElem } from "@lialh4/effect-dom/Elem"
import type { SelSyntaxError, ElemNotFoundError, ElemTypeMismatchError } from "@lialh4/effect-dom/Errors"

const program = findElem(document, HTMLVideoElement, "#player")
// Effect<HTMLVideoElement, SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError>
```

用普通的 `Effect` 组合子处理错误：

```ts
import { Effect } from "effect"
import { findElemOpt } from "@lialh4/effect-dom/Elem"

// 用 Option 兜底，而不是失败
const maybe = await Effect.runPromise(
  findElemOpt(document, HTMLButtonElement, "#submit"),
)

// 处理特定错误标签
const program = findElem(document, HTMLVideoElement, "#player").pipe(
  Effect.catchTag("ElemNotFoundError", () =>
    Effect.succeed(document.createElement("video")),
  ),
)
```

## dual API

所有 `(on, what, sel)` 形状的函数都是 `dual`：查询根可以放在任一位置，并且都提供
`xxxOn` 变体用于柯里化风格：

```ts
// 数据优先
findElem(document, HTMLVideoElement, "video")

// 数据最后
findElem(HTMLVideoElement, "video")(document)

// xxxOn
findElemOn(document, HTMLVideoElement)("video")
```

`findElemOpt`、`isElemExists`、`findElems`、`findElemsAll`、`waitElem`、`waitElems`、
`addedStream`、`removedStream`、`attrStream` 以及 `findByText` 系列同理。
`waitElemGone`/`waitDetached` 也提供 `xxxOn`。

## 等待默认无超时，deadline 由你掌控

任何等待函数都不接受 `timeout`。deadline、重试与取消属于 `Effect`，类型化错误属于你：

```ts
import { Data, Effect } from "effect"
import { waitElem } from "@lialh4/effect-dom/Elem"

class PlayerTimeout extends Data.TaggedError("PlayerTimeout")<{ sel: string }> {}

const player = waitElem(document, HTMLVideoElement, "video").pipe(
  Effect.timeoutFail({
    duration: "10 seconds",
    onTimeout: () => new PlayerTimeout({ sel: "video" }),
  }),
)
```

常用组合子：

| 目标             | 组合子                                            |
| ---------------- | ------------------------------------------------- |
| 限制等待         | `Effect.timeout`（以 `TimeoutException` 失败）    |
| 限制并自定义错误 | `Effect.timeoutFail`                              |
| 超时返回 Option  | `Effect.timeoutOption`                            |
| 重试             | `Effect.retry(Schedule.exponential("200 millis"))`|
| 竞速             | `Effect.race` / `Effect.raceFirst`                |

## 中断与资源安全

任何观察 DOM 的功能（`waitElem`、`mutStream`、`waitInView`、`waitEvent`、
`keepPlaying`、`watchStall`）都会注册 `MutationObserver`、
`IntersectionObserver` 或监听器，并在 fiber 被中断时断开：

```ts
const fiber = Effect.runFork(waitElem(document, HTMLVideoElement, "video"))
// 页面变了，不想再等：
await Effect.runPromise(Fiber.interrupt(fiber)) // observer 同步断开
```

这正是库暴露 `Effect` 而非回调的原因：你永远不必记住 `disconnect()` 或
`clearInterval`。

## Realm 安全

Content script 运行在隔离世界，iframe 拥有自己的构造函数，因此单靠 `instanceof`
并不可靠。`isElem`（所有类型化查询的底层）先尝试 `instanceof`，再**按名字从元素
自身所在 realm** 解析构造函数：

```ts
import { isElem } from "@lialh4/effect-dom/Elem"

// 即使 HTMLVideoElement 来自另一个 realm，也为 true
isElem(iframeVideo, HTMLVideoElement)
```

## 测试

因为一切都是 `Effect`，可直接配合 `happy-dom` / `jsdom` 测试：

```ts
import { Effect } from "effect"
import { expect, test } from "vitest"
import { waitElem } from "@lialh4/effect-dom/Elem"

test("等待播放器", async () => {
  const video = document.createElement("video")
  const fiber = Effect.runFork(waitElem(document, HTMLVideoElement, "video"))
  document.body.appendChild(video)
  await expect(Effect.runPromise(fiber)).resolves.toBe(video)
})
```

## 下一步

- [elem.md](./elem.md) —— 查询、读取、等待与流
- [wait.md](./wait.md) —— 等待状态
- [interact.md](./interact.md) —— 交互动作
- [media.md](./media.md) —— 播放监管
- [observers.md](./observers.md) —— 原始变更、iframe、错误、类型
