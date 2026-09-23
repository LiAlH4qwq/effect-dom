# Wait

**语言：** [English](../en/wait.md) · [简体中文](./wait.md) · [目录](./README.md)

除"元素插入"之外的状态等待与谓词：属性、class、可见性、可用性、可操作性、
事件与媒体进度。

```ts
import { Effect, Option } from "effect"
import * as Wait from "@lialh4/effect-dom/Wait"
```

## 选项

```ts
interface WaitOpts {
  /** 谓词检查间隔，默认 "50 millis"。 */
  readonly interval?: DurationInput
}
```

等待**默认无超时**。用 `Effect` 组合设限：

```ts
yield* Wait.waitVisible(document, "#overlay").pipe(
  Effect.timeoutFail({
    duration: "5 seconds",
    onTimeout: () => new Error("遮罩一直没出现"),
  }),
)
```

## 谓词等待

| 函数                                    | 返回值 | 说明                                             |
| --------------------------------------- | ------ | ------------------------------------------------ |
| `waitFor(predicate, opts?)`             | `void` | 轮询布尔谓词。                                   |
| `until(compute, opts?)`                 | `A`    | 返回值：轮询直到 `compute` 返回 `Some`。         |
| `waitStable(compute, eq, quiet, opts?)` | `A`    | 值在 `quiet` 内保持不变后返回。                  |

```ts
// 布尔
yield* Wait.waitFor(() => document.readyState === "complete")

// 返回值
const firstRow = yield* Wait.until(() =>
  Option.fromNullable(document.querySelector(".row")),
)

// 稳定检测（例如客户端渲染的列表）
const count = yield* Wait.waitStable(
  () => document.querySelectorAll(".row").length,
  (previous, next) => previous === next,
  "300 millis",
)
```

## 元素状态等待

| 函数                              | 返回值    | 说明                                        |
| --------------------------------- | --------- | ------------------------------------------- |
| `waitForElement(on, sel)`         | `Element` | 无类型的"存在"等待（观察者 + 轮询）。      |
| `waitAttr(on, sel, name, opts?)`  | `string`  | 等待属性；`{ equals }` 指定期望值。        |
| `waitClass(on, sel, clazz, opts?)`| `Element` | 等待 class。                                |
| `waitVisible(on, sel, opts?)`     | `Element` | 已挂载、非 `hidden`、非 `display:none` 等。 |
| `waitEnabled(on, sel, opts?)`     | `Element` | 非 `disabled`、非 `aria-disabled="true"`。  |
| `waitActionable(on, sel, opts?)`  | `Element` | 可见 + 可用 + 未被遮挡。                    |
| `waitInView(on, sel, opts?)`      | `Element` | `IntersectionObserver` 判定进入视口。       |

```ts
const state = yield* Wait.waitAttr(document, "#player", "data-state", {
  equals: "ready",
})
yield* Wait.waitClass(document, "video.vjs-tech", "vjs-playing")
yield* Wait.waitVisible(document, "#overlay")
yield* Wait.waitEnabled(document, "button[type=submit]")
yield* Wait.waitInView(document, ".vjs-big-play-button")
```

`WaitInViewOpts` 接受 `root`、`rootMargin`、`threshold`，与原生
`IntersectionObserver` 一致。当环境没有 `IntersectionObserver` 时退化为存在即返回。

## 可操作性

```ts
interface ActionableOpts {
  readonly visible?: boolean   // 默认 true
  readonly enabled?: boolean   // 默认 true
  readonly uncovered?: boolean // 默认 true
}

Wait.isActionable(elem, opts?): boolean
Wait.waitActionable(on, sel, opts?): Effect<Element, SelSyntaxError>
```

`isActionable` 是纯检查，会读取 `getComputedStyle`、`getBoundingClientRect` 与
`elementFromPoint`，只有在真实布局下才可信。配合 `Interact.clickIfActionable` 使用：

```ts
import { clickIfActionable } from "@lialh4/effect-dom/Interact"

const button = yield* Wait.waitActionable(document, ".vjs-big-play-button")
yield* clickIfActionable(button)
```

## 事件

```ts
// 等待下一个匹配事件并返回值
const ended = yield* Wait.waitEvent(video, "ended")

// 构造取消信号
const navigation = Wait.waitEvent(window, "popstate")
```

`waitEvent<T>(target, type, options?)` 在完成**和**中断时都会移除监听器。

## 竞速

```ts
Wait.waitAny(effects)
```

`waitAny` 并发运行多个等待，返回第一个成功；仅当全部失败时才失败。它就是
`Effect.raceAll`，每个分支保留各自的成功与错误类型。

```ts
const outcome = yield* Wait.waitAny([
  Wait.waitClass(document, "video.vjs-tech", "vjs-played"),
  Wait.waitEvent(video, "error"),
])
```

## 媒体辅助

`Wait` 重新导出两个简单的媒体谓词；更完整的监管见 [Media](./media.md)。

```ts
Wait.isMediaEnded(video): boolean
Wait.waitMediaEnded(video, opts?): Effect<void>
```

## 注意事项

- `isVisible` 只表示"已挂载且未被 CSS/`hidden` 隐藏"，不检查屏幕几何。
  "确实在屏幕上"请用 `waitInView`。
- `waitVisible`/`waitEnabled` 每次轮询都会重新查询选择器，元素被替换时会跟随新元素。
- `waitStable` 需要相等函数；基本类型用 `(a, b) => a === b` 即可。
