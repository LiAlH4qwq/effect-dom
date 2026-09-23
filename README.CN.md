# Effect Dom

**语言：** [English](./README.md) · [简体中文](./README.CN.md) · [详细文档](./docs/zh/README.md)

**类型安全、响应式的 DOM 自动化——为浏览器插件而生。**

`querySelector` 返回 `null`？类型断言全靠猜？`setInterval` 到处泄漏？Effect Dom 把每一次 DOM 操作都变成可组合、可超时、可中断的 `Effect`：出错在类型里，等待靠事件，清理交给运行时。

![Version](https://img.shields.io/npm/v/%40lialh4%2Feffect-dom?style=for-the-badge)
![License](https://img.shields.io/npm/l/%40lialh4%2Feffect-dom?style=for-the-badge)

---

## 为什么插件开发者需要它

浏览器插件最擅长的事，是在**别人的页面**上动手术。可那些页面：

- 结构随时改版，选择器今天能用、明天就 `null`；
- SPA 异步渲染，元素要晚几百毫秒才出现；
- React / Vue 接管输入框，`input.value = "x"` 被默默吞掉；
- 第三方脚本、跨域 iframe、Shadow DOM 层层嵌套；
- 用户随时切换页面，你注册的 `MutationObserver`、`setInterval` 还在后台空跑。

于是 content script 常常写成这样：

```ts
// 😰 传统写法：探测、清理、超时、异常处理全挤在一起
let tries = 0
const timer = setInterval(() => {
  const el = document.querySelector("video.vjs-tech")
  if (el) {
    clearInterval(timer)
    ;(el as HTMLVideoElement).play().catch(() => {})
  }
  if (++tries > 100) clearInterval(timer) // 希望自己记得清理
}, 200)
```

一旦页面提前导航，定时器就变成了内存泄漏；一旦元素类型不对，只能在运行时炸给用户看。

### Effect Dom 的写法 ✨

```ts
import { Effect } from "effect"
import { waitElem } from "@lialh4/effect-dom/Elem"
import { safePlay } from "@lialh4/effect-dom/Interact"

const program = waitElem(document, HTMLVideoElement, "video.vjs-tech").pipe(
  Effect.timeout("10 seconds"), // 超时由 Effect 负责
  Effect.flatMap(safePlay), // 播放被浏览器拒绝也不会炸
)

Effect.runPromise(program)
```

元素出现的那一刻，观察者立刻触发并**自动断开**；就算中途被导航打断，Effect 的 fiber 也会清理资源。没有轮询、没有泄漏、没有 `as`。

---

## 安全，是刻在类型里的

插件跑在不受你控制的页面里，**任何一步都可能失败**。Effect Dom 不让失败变成异常，而是让失败出现在类型签名里。

| 你可能遇到的问题               | Effect Dom 的答案                                    |
| ------------------------------ | ---------------------------------------------------- |
| 选择器写错，`querySelector` 抛 | `SelSyntaxError`（类型里，不抛）                     |
| 元素还不存在                   | `waitElem` 等它；`findElemOpt` 返回 `Option.none()`  |
| 元素存在但类型不对             | `ElemTypeMismatchError`，附带期望/实际类型           |
| iframe 跨域读不了文档          | `CrossOriginError`，附带出错的 iframe                |
| 媒体自动播放被拒               | `MediaPlayError`，或用 `safePlay` 直接忽略           |
| 页面导航，监听器泄漏           | fiber 中断即 `disconnect()`，由 Effect 管理资源      |
| 页面永不满足条件               | `Effect.timeout` / `Effect.timeoutFail` 显式收口     |

```ts
// 所有失败都在类型里，编译器会提醒你处理
findElem(document, HTMLVideoElement, "#player")
// Effect<HTMLVideoElement, SelSyntaxError | ElemNotFoundError | ElemTypeMismatchError>
```

### 资源永不泄漏

`waitElem`、`waitInView`、`waitEvent`、`mutStream` 都通过 `Effect` 的 `acquireRelease` / `async` 注册清理逻辑。fiber 被中断（用户关掉标签页、插件被卸载、你主动 `Fiber.interrupt`）时，观察者和事件监听器都会立刻释放：

```ts
const fiber = Effect.runFork(waitElem(document, HTMLVideoElement, "video"))
// 页面变了，不想再等了：
Effect.runPromise(Fiber.interrupt(fiber)) // MutationObserver 同步断开
```

### 框架安全地表单交互

React / Vue 会拦截实例上的 `value` setter 来跟踪输入。Effect Dom 用**原型上的原生 setter** 写入，再派发 `input` / `change`，所以受控组件会真正响应：

```ts
const email = await Effect.runPromise(
  waitElem(document, HTMLInputElement, "input[type=email]"),
)
await Effect.runPromise(setValue(email, "me@example.com"))
```

### 跨域、iframe、Shadow DOM 都不再是例外

查询根（`QueryRoot`）是 `Element | Document | DocumentFragment`，因此也包含 `ShadowRoot`，Shadow DOM 组件无需特殊处理。iframe 有专门的 `waitInnerDoc`，等框架加载完再取文档：

```ts
findElem(document, HTMLIFrameElement, "#player-frame").pipe(
  Effect.flatMap(waitInnerDoc), // 等 load，再拿 contentDocument
  Effect.flatMap(findElem(HTMLVideoElement, "video")),
)
```

---

## 高效，是因为它在等事件，而不是在空转

**事件驱动，而非轮询。** `waitElem` / `waitElems` / `waitElemGone` / `waitAttr` / `waitClass` 全部基于 `MutationObserver`，元素一出现就唤醒，延迟只有一次微任务；只有当你明确使用 `waitFor(predicate)`、`waitVisible`、`waitEnabled` 这类“状态查询”时，才会按你指定的节奏轮询（默认 50ms）。

**变更流可裁剪。** `mutStream` 支持 `selector` 过滤与 `debounce` 合并，把 SPA 的连珠炮变更收敛成一次处理：

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

**组合即编排。** 不再有回调金字塔：查找 → 等待 → 输入 → 播放，一条 `pipe` 表达完整流程，任何一步失败都会短路，错误类型可被穷举处理。

**纯函数、零魔法。** 库内部没有 `let`、没有 `for` / `while`、没有可变状态——只有对原生 DOM 的薄封装。行为可预测，包体可 tree-shake，ESM / CJS / TS 类型一应俱全。

**可测试。** 一切都是普通的 `Effect`，配合 `happy-dom` / `jsdom` 直接 `runPromise`，插件逻辑可以像业务逻辑一样写单测。

---

## 插件实战速查

### 1. 等待播放器出现并播放

```ts
const program = waitElem(document, HTMLVideoElement, "video.vjs-tech").pipe(
  Effect.timeoutFail({
    duration: "8 seconds",
    onTimeout: () => new Error("播放器迟迟没出现"),
  }),
  Effect.flatMap(safePlay),
)
```

### 2. 自动填写登录表单

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

  const submit = yield* findByText(document, HTMLButtonElement, "登录")
  yield* click(submit)
})
```

### 3. 等一个元素消失（例如返回上一页后）

```ts
// 属性 / class 变化也算“消失”
yield* waitElemGone(document, "video.vjs-tech")
```

### 4. 等媒体播放结束

```ts
yield* waitMediaEnded(video)
// 或者等任意事件：
yield* waitEvent(video, "ended")
```

### 5. 几个条件谁先满足都行

```ts
const outcome = yield* waitAny([
  waitClass(document, "video.vjs-tech", "vjs-played"),
  waitEvent(video, "error").pipe(Effect.andThen(Effect.fail("播放失败"))),
])
```

### 6. 进入 Shadow DOM 组件

```ts
const host = yield* findElem(document, HTMLElement, "my-widget")
const root = host.shadowRoot!
const confirm = yield* findElem(root, HTMLButtonElement, ".confirm")
yield* click(confirm)
```

### 7. 可选查询，不把“没找到”当错误

```ts
import { isElemExists, findElemOpt, findElemsAll } from "@lialh4/effect-dom/Elem"

const maybeBanner = yield* findElemOpt(document, HTMLElement, ".cookie-banner")
const hasBanner = yield* isElemExists(document, HTMLElement, ".cookie-banner")
const rows = yield* findElemsAll(document, HTMLTableRowElement, "table tr") // [] 合法
```

### 8. 监管 Video.js 播放器

```ts
import {
  endedWithin,
  finishMedia,
  keepPlaying,
  waitCanPlay,
  watchStall,
} from "@lialh4/effect-dom/Media"

// 元素存在 != 可播放：preload="none" 时 readyState 会一直是 0
yield* waitCanPlay(video, { interval: "100 millis" })

// 站点会在背后重置 muted 并暂停；keepPlaying 每 tick 重新应用，
// 一旦卡住，watchStall 让整组失败并自动中断 keepPlaying
yield* Effect.all(
  [keepPlaying(video, { muted: true, playbackRate: 1.5 }), watchStall(video)],
  { concurrency: "unbounded" },
)

// 差 ~2 秒才结束的流永远不会触发 ended
yield* endedWithin(video, 2)
yield* finishMedia(video) // 跳到 duration，逼平台触发 ended/complete
```

### 9. 等待“数据”而不是元素

```ts
import { until, waitStable } from "@lialh4/effect-dom/Wait"

// 直接拿到第一个 Some，不用先 waitFor 再读取
const firstRow = yield* until(() =>
  Option.fromNullable(document.querySelector(".row")),
)

// 等客户端渲染的列表真正稳定下来
const rowCount = yield* waitStable(
  () => document.querySelectorAll(".row").length,
  (previous, next) => previous === next,
  "300 millis",
)
```

### 10. 只在真正可点击时才点

```ts
import { clickIfActionable } from "@lialh4/effect-dom/Interact"
import { waitActionable } from "@lialh4/effect-dom/Wait"

// 可见 + 可用 + 未被其它元素遮挡
const playButton = yield* waitActionable(document, ".vjs-big-play-button")
yield* clickIfActionable(playButton)
```

### 11. 监听新增 / 移除 / 属性变化

```ts
import { addedStream, attrStream, removedStream } from "@lialh4/effect-dom/Elem"
import { Stream } from "effect"

yield* removedStream(document, ".row").pipe(Stream.take(1), Stream.runDrain)
yield* attrStream(document, "video.vjs-tech", "class").pipe(
  Stream.tap(change => Effect.log(change.oldValue, "->", change.value)),
  Stream.runDrain,
)
```

### 12. 跨 realm 的类型匹配

`isElem` 先尝试 `instanceof`，再按名字从**元素自身所在 realm** 解析构造函数——隔离世界的内容脚本与子框架都能正确匹配：

```ts
// 这里的 HTMLVideoElement 来自另一个 realm，也能匹配
const frameDoc = yield* waitInnerDoc(frame)
yield* findElem(frameDoc, HTMLVideoElement, "video")
```

---

## 特性一览

- ✅ **类型安全查询**——拿到的就是你声明的类型，或者一个明确的错误。
- 🔒 **跨域感知**——iframe 安全访问，错误类型清晰。
- 🔗 **可组合**——用 `pipe` 串联，错误在类型层面传播。
- 👀 **响应式**——`Stream` 暴露原始变更，`waitElem` 等元素、属性、可见性、媒体状态。
- 🖱️ **可交互**——点击、输入、勾选、按键、滚动、驱动媒体，全部是 `Effect`。
- 🎬 **媒体感知**——就绪、卡顿检测、容差结束、强制收尾，以及 keep-playing 监管器。
- 🎯 **可操作性**——只在元素真正可交互时才等待和点击。
- 🧩 **框架友好**——原生 setter + 事件，受控组件也会响应。
- 🪶 **零运行时开销**——对原生 DOM 的薄封装；无可变状态、无循环、无异常。

## 模块与 API

| 模块       | 用途                | 关键 API                                                                                                                            |
| ---------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Elem`     | 查询、等待、流、读取 | `findElem` `findElemOpt` `isElemExists` `findElemsAll` `findByText` `waitElem` `waitElems` `waitElemGone` `addedStream` `attrStream`      |
| `Wait`     | 等待状态            | `waitFor` `until` `waitStable` `waitAttr` `waitClass` `waitVisible` `waitActionable` `waitEvent` `waitAny` `waitInView`             |
| `Media`    | 监管播放            | `waitCanPlay` `waitReadyState` `watchStall` `endedWithin` `finishMedia` `keepPlaying`                                              |
| `Interact` | 与元素交互          | `click` `clickIfActionable` `setValue` `check` `press` `type` `scrollIntoView` `safePlay` `seek` …                                  |
| `Mut`      | 观察变更流          | `mutStream`（支持 `selector` / `debounce` / `attributeFilter`）                                                                      |
| `Doc`      | iframe 文档         | `getInnerDoc` `waitInnerDoc`                                                                                                        |
| `Errors`   | 类型化错误          | `SelSyntaxError` `ElemNotFoundError` `ElemTypeMismatchError` `CrossOriginError` `MediaPlayError` `StallError`                      |

> 等待类 API 默认**无超时**（这是刻意的）。用 `Effect.timeout` 设定上限，或用 `Effect.timeoutFail` 得到带类型的超时错误。

## 详细文档

完整的指南与 API 参考，双语提供：

- **简体中文** —— [索引](./docs/zh/README.md)：[指南](./docs/zh/guide.md) · [Elem](./docs/zh/elem.md) · [Wait](./docs/zh/wait.md) · [Interact](./docs/zh/interact.md) · [Media](./docs/zh/media.md) · [观察器与错误](./docs/zh/observers.md)
- **English** —— [index](./docs/en/README.md): [Guide](./docs/en/guide.md) · [Elem](./docs/en/elem.md) · [Wait](./docs/en/wait.md) · [Interact](./docs/en/interact.md) · [Media](./docs/en/media.md) · [Observers & errors](./docs/en/observers.md)

## 安装

```shell
pnpm add @lialh4/effect-dom effect
```

## 许可

MIT

## 更新日志

### 未发布

- 新增 `Media` 模块：`waitReadyState`、`waitCanPlay`、`watchStall`、`endedWithin`/`isEndedWithin`、`finishMedia`、`keepPlaying`。
- 新增 `StallError`，用于暂停/冻结的播放。
- `Wait.until`（返回值等待）与 `Wait.waitStable`（稳定检测）现已公开。
- 可操作性：`Wait.isActionable`/`waitActionable` 与 `Interact.clickIfActionable`。
- `Elem.addedStream`、`removedStream`、`attrStream`（dual，带 `xxxOn` 变体）封装 `mutStream`。
- `isElem` 支持跨 realm 解析构造函数，隔离世界与子框架都能正确匹配。
- 新增 `Interact.setPlaybackRate`。
- `QueryRoot` 现在是精确联合类型 `Element | Document | DocumentFragment`（仍包含 `ShadowRoot`）。
- 为命名一致重命名谓词：`elemIs` → `isElem`，`exists`/`existsOn` → `isElemExists`/`isElemExistsOn`，`mediaEnded` → `isMediaEnded`。

### 0.2.0

- `waitElem` 现在会忽略类型不符的新增节点，仅在选择器非法时失败。
- 新增 `Wait` 模块：`waitFor`、`waitAttr`、`waitClass`、`waitVisible`、`waitEnabled`、`waitMediaEnded`、`waitEvent`、`waitAny`、`waitInView`。
- 新增 `Interact` 模块：`click`、`setValue`/`setInputValue`、`setChecked`/`check`/`uncheck`、`press`、`type`、`focus`、`blur`、`hover`、`scrollIntoView`、`submit`、`dispatch` 及媒体控制。
- 新增查询辅助：`findElemOpt`、`exists`、`findElemsAll`、`findByText`/`findByTextOpt`、`getText`、`getAttr`、`getProp`、`hasAttr`、`hasClass`、`child`、`waitElems`、`waitElemGone`/`waitDetached`。
- 所有 `(on, what, sel)` 形状的查询/等待函数都支持 `dual`（数据优先 / 数据最后）并配有 `xxxOn` 变体。
- 查询根现在接受任意 `ParentNode`，包括 `ShadowRoot`。
- `mutStream` 增加 `selector`、`debounce` 过滤与 `attributeFilter`。

### 0.1.1

修正 README 中的示例。

### 0.1.0

初版发布！ :tada:
