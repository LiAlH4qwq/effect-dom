# Effect Dom — 详细文档

**语言：** [English](../en/README.md) · [简体中文](./README.md)

`@lialh4/effect-dom` 是面向浏览器插件与用户脚本的类型安全、响应式 DOM 自动化层。
每一次 DOM 操作都是一个 `Effect`：错误在类型里，等待由事件驱动，中断即释放资源。

- NPM：`@lialh4/effect-dom`
- 根 README：[English](../../README.md) · [简体中文](../../README.CN.md)
- 对等依赖：[`effect`](https://effect.website) ^3.18

## 目录

| 页面                           | 内容                                                     |
| ------------------------------ | -------------------------------------------------------- |
| [guide.md](./guide.md)         | 安装、content script 配置、心智模型、dual API、超时、测试 |
| [elem.md](./elem.md)           | 查询、读取、等待元素与元素流                              |
| [wait.md](./wait.md)           | 等待状态：属性、可见性、可操作性、事件、竞速              |
| [interact.md](./interact.md)   | 点击、输入、赋值、按键、媒体控制                          |
| [media.md](./media.md)         | 就绪、卡顿检测、容差结束、强制收尾、监管                  |
| [observers.md](./observers.md) | 原始变更流、iframe、错误分类、共享类型                    |

## 快速安装

```shell
pnpm add @lialh4/effect-dom effect
```

## 60 秒速览

```ts
import { Effect } from "effect"
import { findElem, waitElem } from "@lialh4/effect-dom/Elem"
import { setValue, safePlay } from "@lialh4/effect-dom/Interact"
import { waitCanPlay, watchStall, keepPlaying } from "@lialh4/effect-dom/Media"

const program = Effect.gen(function* () {
  // find：以类型化错误失败，绝不抛出
  const email = yield* findElem(document, HTMLInputElement, "input[type=email]")

  // interact：框架安全的赋值
  yield* setValue(email, "me@example.com")

  // wait：事件驱动、可中断、默认无超时（用 Effect.timeout 设限）
  const video = yield* waitElem(document, HTMLVideoElement, "video").pipe(
    Effect.timeout("10 seconds"),
  )

  // media：元素存在 != 可播放
  yield* waitCanPlay(video)
  yield* safePlay(video)

  // 监管：一旦卡住，整组失败
  yield* Effect.all([keepPlaying(video), watchStall(video)], {
    concurrency: "unbounded",
  })
})
```

## 设计原则

1. **有用** —— 覆盖插件与用户脚本的高频 DOM 需求。
2. **简洁** —— API 面积小，不含站点专用函数。
3. **严格函数式** —— 无循环、无可变、无抛出。
4. **严格安全** —— `pnpm check` 与 `pnpm test` 通过即证明 API 全域（total）。
