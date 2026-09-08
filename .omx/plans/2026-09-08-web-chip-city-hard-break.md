# [Hard break] 将 LinxSimCity 重建为拓扑驱动、可仿真、可追踪 Tile 的 3D 芯片城市网页游戏

## 目标与决策

把 LinxSimCity 重建为面向芯片架构的浏览器拓扑与仿真游戏。系统从 pyCircuit / SuperScalarModel 导出的组件与端口拓扑自动生成 3D 芯片城市及其全部连接，用户运行受支持的 workload，观察 SimQueue 之间的事务流动和 Tile 的实际存储位置，再根据瓶颈修改来源模型或配置并重新运行。

核心循环：**载入拓扑 → 校验/生成城市 → 运行 → 观察与追踪 → 修改模型配置 → 重新生成并对比结果**。

2026-09-08 用户澄清：不需要用户放置积木。拓扑是组件实例和连接关系的唯一权威；浏览器只负责生成布局、选择、展开、追踪与回放，不创建、删除或重连硬件节点/边。

产品负责人已明确授权 **hard break**：旧实现可以放弃。这是重新设计产品与核心契约的改造，不要求保持旧页面、固定布局、旧组件 API、旧存档或旧 trace 的兼容性。本 issue 负责安排实施；创建 issue 本身不删除代码、不切换线上站点。

## Hard break 边界

- 仓库与产品名继续使用 LinxSimCity。实现沿一个主路径推进，不保留 `legacy` / `v1` / `v2` 双套运行模式、兼容开关或自动旧格式 reader。
- 旧城市布局、分区专用渲染、旧 UI、旧 demo、旧布局快照和过时设计文档可删除或重写。旧设计仅由 Git 历史保留，新 `DESIGN.md` 和契约文档成为实现依据。
- 不预先承诺复用任何旧实现。基础工具只有满足新契约且通过相应测试时才可保留；不得为了复用而扭曲新设计。
- 若 trace / topology / save 契约改变，同步更新 schema、SDK、CLI、producer adapter、fixture 和消费者；只发行一种当前格式。旧格式明确报“不受支持”，随发行提供重新生成数据的命令，不做兼容运行层。
- 旧真实 trace 必须由已固定版本的仿真源重新生成；无法重建的示例退出默认发行。合成 fixture 标为 synthetic，不能冒充真实仿真。
- hard break 不授权篡改模拟器语义、降低正确性要求或把旧失败改成成功。替换测试时，明确区分被废弃的产品行为与仍须验证的周期、身份、状态和回放不变量。

## 当前事实与来源

本计划基于 LinxSimCity `7a324fa6f98638d6fbff4754df1ca31e99ee92a7`，创建时本地 HEAD 与 GitHub `main` 一致，工作树干净。

| 已核对的事实                                                                                                           | 对改造的影响                                                                      | 证据                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 现产品是 WebGL trace viewer；已有 SDK、CLI、trace bundle 和 Worker 回放基础                                            | 这些是可评估的旧实现，不是新游戏的兼容性要求                                      | [README](https://github.com/LinxISA/LinxSimCity/blob/7a324fa6f98638d6fbff4754df1ca31e99ee92a7/README.md#L3-L44)                                                                                                                                                               |
| viewer 已使用 React、R3F、Zustand、Vite                                                                                | 继续这一技术方向，无须切换游戏引擎才能达成目标                                    | [依赖](https://github.com/LinxISA/LinxSimCity/blob/7a324fa6f98638d6fbff4754df1ca31e99ee92a7/apps/viewer/package.json#L16-L34)                                                                                                                                                 |
| City 显式组合 Scalar、Vector、Cell、Cube、TLSU、StageCity，并含旧路径选择                                              | 新场景改为由组件定义、实例图和标准渲染器驱动                                      | [City.tsx](https://github.com/LinxISA/LinxSimCity/blob/7a324fa6f98638d6fbff4754df1ca31e99ee92a7/packages/scene-modules/src/City.tsx#L24-L123)                                                                                                                                 |
| 当前 topology 含既定 kind、district、placement、route；已有 queue / cell / pipe 等事件                                 | 需要重新定义可编辑装配图、空间布局、Tile 生命周期和 producer 能力契约             | [topology 类型](https://github.com/LinxISA/LinxSimCity/blob/7a324fa6f98638d6fbff4754df1ca31e99ee92a7/packages/topology/src/types.ts#L1-L75)、[事件](https://github.com/LinxISA/LinxSimCity/blob/7a324fa6f98638d6fbff4754df1ca31e99ee92a7/docs/trace-format/events.md#L21-L65) |
| pyCircuit DavinciOO 有 7 个 H1、31 个 H2、240 个 H3 候选；候选含内部状态、接口、别名与未决归属，catalog 是初始分析快照 | 要求 240 项可追溯映射，不能造出 240 个虚假的独立硬件实例；当前实现状态另行核对    | [DavinciOO 目录](https://github.com/PTO-ISA/pyCircuit/blob/6c9bf7eabab70a30bed7e4081bde5a4ae5f7433c/designs/davincioo/README.md#L15-L63)、[catalog](https://github.com/PTO-ISA/pyCircuit/blob/6c9bf7eabab70a30bed7e4081bde5a4ae5f7433c/designs/davincioo/catalog.json)        |
| SuperScalarModel 的 SL2 设计区分请求循环与数据驻留循环，并通过关联事件连接身份                                         | 指令/请求令牌、数据传输和 Tile 驻留必须分别表示                                   | [SL2 设计](https://github.com/LinxISA/SuperScalarModel/blob/61fdf3c9239068ebc24c330722063dbe589ea5d1/modelSpec/tlsu/sl2_viz_modeling_spec.md#L9-L39)                                                                                                                          |
| 一处实际 SimQueue 实现在 Work 中推进，Xfer 为空                                                                        | 不能把抽象的 Work/Xfer 约定硬编码为所有后端的事件时序；必须核对实际实例和调度入口 | [SimQueue](https://github.com/LinxISA/SuperScalarModel/blob/61fdf3c9239068ebc24c330722063dbe589ea5d1/TimingSim/common/ModelCommon/SimQueue.h#L25-L46)                                                                                                                         |

上述源码与文档核对不等于已验证当前全套仿真或新产品性能。

## 产品与技术要求

### 游戏与空间交互

- 首发面向桌面浏览器、键鼠、单人；支持内置场景、拓扑导入、搜索、层级展开和引导挑战。
- 组件实例、参数、层级和类型化端口连接全部来自拓扑。浏览器不得提供放置、删除、复制、重连或参数修改硬件结构的入口。
- 默认轴测视角；支持自由相机、搜索定位、城区/模块/内部状态逐级展开、楼层切片与路径聚焦。
- XYZ 没有固定棋盘边界。采用整数空间分块与块内坐标、相机相对渲染、按需加载和 LOD；不承诺无限内存或无限同时可见物体。
- 展示布局是拓扑的确定性派生数据，不反向修改硬件语义。每次 run 绑定不可变的 topology/config hash，旧 trace 只能继续解释原 run，不能套在新拓扑上。
- 是否能运行由后端能力表决定。未支持的拓扑在运行前定位到具体组件/端口/参数，不伪造结果。

### 标准积木与美术

- 先精制约 10–15 种参数化形态：Queue/FIFO、Table/CAM、SRAM/Bank、Register File、ALU、Vector、Cube/MAC、Arbiter、Crossbar、Port/Link、复合模块容器等。
- 每个定义声明稳定类型 ID、参数、端口类型/方向/宽度/协议、状态字段、空间包围盒、吸附点、LOD、材质语义、数据绑定与来源。
- 每个 topology node 必须携带物理面积记录，统一归一化为 `µm²`，并声明 `measured / estimated / aggregate / unknown` 与证据来源；缺少 PPA 数据时使用显式 unknown，不能用 3D 外形面积代替。
- 240 个候选按 `leaf / contained-state / interface / alias / unresolved` 等明确归属映射。别名指向唯一 owner，内部状态在 owner 内展开，未决组件标识状态；不能重复分配同一状态。
- 功能域映射城区，子系统映射街区，模块映射建筑；容量、bank、lane 等参数改变几何与可检查内容。容量数字不直接当作真实物理尺寸或面积估计。
- 视觉方向：精密工业微缩城市，统一倒角、底座、端口、金属/陶瓷/玻璃材质、柔和阴影与克制发光。活动、阻塞、未知、选中各有固定语义，颜色同时配合形状或文字。
- 全景、中景、近景均须有实机截图与交互检查。不能以彩色方块加大量 bloom 代替组件辨识度、层次和制作质量。

### Trace、Tile 与真实性

- 独立数据对象：组件定义、拓扑节点/端口边、派生展示布局、run manifest、初始状态/checkpoint 和稀疏事件。
- run manifest 记录模拟器版本/源码 revision、workload、配置、topology hash、采样范围、采集能力、截断/丢失信息。校验器拒绝错误来源绑定。
- 事件有确定的时间域/周期/阶段/序号和实体 ID；明确多时钟域边界、同周期排序、reset/flush/cancel 与快照边界。64 位身份/地址采用无损表示，不经过不安全的 JS Number 转换。
- 队列要区分写入尝试、接受/发布、可见、读取、阻塞、取消和占用变化；绘制的跨组件流动必须能追溯到被接受的传输事件。
- 指令/请求/完成令牌与数据对象身份分离。Tile 标识包含逻辑身份与版本；存储绑定包含物理实例、bank/row/slot 或区间、分配代次和有效范围，支持跨 bank、分片、多副本、部分写、迁移及释放复用。
- 选中指令可追踪相关 Tile；选中 Tile 可检查驻留、生产者、消费者与相关传输。不能由同地址、同数值或场景距离推断身份/延迟。
- 缺失观测显式显示 unknown；合成、美术预览、真实仿真三种来源在界面可辨认。汇总视图可聚合，精确检查必须回到原始周期与事件。
- Worker 负责解析、校验、索引、checkpoint 恢复与状态归约；渲染帧只插值显示，不推进模拟器。快速 seek 取消旧请求，最新选择不能被迟到结果覆盖。

### 技术方向与范围

- React + TypeScript + Vite；Three.js + React Three Fiber，Drei 按需使用；WebGL2 首发，WebGPU 在实际 profiling 后再决定。
- Zustand 管 UI/低频状态；高频实例更新与数据流动画使用批量缓冲与渲染循环，避免逐 token/逐周期 setState。
- 参数化几何为主，必要的精制资产用 Blender/glTF；实例化渲染、空间分块、分级标签与可取消的后台任务从基础结构中考虑。
- 静态网站支持拓扑导入、浏览、挑战引导与已录制结果回放。真实“修改来源配置后重跑”首发通过本机 companion/runner 接受明确的 topology/config 和 workload；没有 runner 时清晰显示不可运行，不在 GitHub Pages 中假装执行本地模拟器。
- runner 只接收类型化配置与受支持 workload，提供任务状态、取消和结果产物；不提供任意 shell 命令接口。实时 trace 流作为后续优化，首发允许任务完成后加载 bundle。
- 首发不包含多人、经济系统、战斗、通用物理引擎、完整浏览器版芯片模拟器或 PPA 签核。所有吞吐/延迟/评分来自可重现的真实运行；没有模型依据的面积/能耗不显示为测量值。

## 实施顺序与可交付里程碑

以下为依赖顺序，不是承诺日期。每个里程碑启动时绑定一个实际负责人、一个独立验收者和对应 PR；跨仓 instrumentation 单独提交到 owning repository，并在本 issue 关联。M0 后可并行推进契约与美术探索；M1 接口稳定后，M2/M3 与 M4 可并行；M5 汇合验收后再扩展目录和玩法。

### M0 — 定义产品、视觉基准和删除清单

- [x] 新建 `DESIGN.md`、`docs/game/architecture.md`、`docs/game/hard-break.md`，明确上述玩法、交互、组件语言、单一格式与后端边界；标注取代的旧文档。
- [x] 列出旧 UI/场景/格式/fixtures/测试的删除、替换、候选保留清单，每项写清新 owner、删除时点和仍保留的语义验证。
- [x] 在 `docs/game/benchmark.md` 固定首个真实 workload、仿真 revision、最小链路、参考浏览器/GPU/机器、画质与 M8 性能场景，形成可重现基准。
- [x] 在 `docs/game/visual-baseline.md` 固定城区总览与 Queue/Table/ROB/Vector/Cube/TMA 近景节点及验收条件，并记录可操作小场景的实机检查；自动截图测试仍由 M2 交付。

**完成条件：** 所有后续模块有明确边界；视觉参考和交互流程可审阅；最小链路能从指定模拟器产生数据，缺失事件有明确补采位置。

### M1 — 新核心契约与 240 项映射清单（依赖 M0）

已完成的 QueueGraph 前置切片：

- [x] 从 pyCircuit canonical Agentic Circuit QueueGraph plan 导入 scope、block、SimQueue 和 producer/consumer edge。
- [x] 默认网页场景由生成的 39-node / 32-edge DavinciOO QueueGraph topology 加载，并绑定 plan/model SHA-256 与 source revision。
- [x] 再生成脚本在相同 revision 下产生逐字节一致的 topology；Pages 验证会拒绝缺失、脏相关输入或 hash 不符的默认 topology。
- [x] 每个 topology node 强制记录 `µm²` 面积、状态与来源；QueueGraph 未提供的 PPA 数据保留为 unknown，容器保留为 aggregate。
- [x] 定义当前 `linxsimcity.trace` manifest 和 16 类 queue/Tile/association/compute/run-control 事件；cycle、地址、版本和 epoch 使用无损 u64 字符串，并提供独立 `simtrace validate` CLI。

- [ ] 重建 `packages/topology`、`packages/trace-schema`；新增 `packages/component-catalog`，定义积木、装配图、布局、存档、run、事件和快照。
- [x] 编写 catalog import，从固定 pyCircuit commit 的 `catalog.json` 与 Git tree manifest 生成带出处和 hash 的 240 项映射报告；reported snapshot 状态与 committed source/test-path evidence 分开记录，不能把目录候选升级成执行拓扑。
- [x] 增加负向 fixture/contract matrix：重复 ID、悬空端口、类型/宽度/方向不符、重复 owner、错误配置 hash、无损整数类型/溢出、非法事件顺序、旧格式、丢事件或截断矛盾。
- [x] 提供当前格式 synthetic gzip bundle、topology fixture、index/checkpoint schema 和 `tools/simtrace` 目录校验入口；hard-break 重写 `sdk/cpp` 最小 writer，并由 CI 使用 TypeScript validator 互验其输出。旧 `tools/linxtrace` 仅为隔离的 viewer 历史路径，M8 随旧 viewer 删除。

**完成条件：** 240 项唯一候选全部有去向和来源；7/31 层级保持可追溯；错误 fixture 被定位拒绝；定义与实例数量分离；新契约可以生成并读取最小 bundle。

### M2 — 精品积木库与新渲染内核（依赖 M0，使用 M1 稳定接口）

- [ ] 重建 `packages/scene-core`；以 `packages/brick-kit` 替换旧分区专用 `packages/scene-modules` 主路径。
- [ ] 完成首批 Queue、Table、SRAM、计算块、端口/连接，并逐步补齐约 10–15 种形态；支持参数变化、内部展开和统一材质。
- [x] 层次区域使用由 topology ID 稳定派生的克制配色；SimQueue 使用带方向标记的透明管道，并由 producer/consumer 几何方向决定连续旋转，端口与边锚点共享同一变换。
- [x] 将 SimQueue 与 topology edge 统一为高架 3D 管廊，使用体积管线、支柱和方向箭头替换灰色细线；Queue entry 按容量有界采样，有数据发光、空 entry 为深灰。
- [x] 布局图中折叠 Queue 节点，以 Queue 的 producer→consumer 关系对真实模块重新拓扑排序；rank/lane 间距按放大后的模块包围盒计算。场景不再绘制独立 Queue 积木，Queue ID 绑定到横平竖直的管道及其数据流光点。
- [x] 统一叶子模块为 8 单位屋顶高度，端口和 Queue 管道共面，移除常规管道的上下段；管道使用透明玻璃材质和荧光数据块。QueueGraph importer 为 Vector/Cube/TMA scope 生成独立 definition，分别渲染线性 MAC、4×4 systolic 闪光阵列和 TMA→DDR 四通道访问预览。
- [x] 组件定义通过 `visual.profile` 声明视觉语义：一维 Table 使用线性槽位，多维 Table 使用矩阵/分层阵列，Reorder Window 使用带 head/tail 标记的 circular buffer；渲染器不依赖显示名猜测类型。
- [x] 存储类积木使用开放式低基座，统一圆角金属/陶瓷外壳与状态材质；拓扑列表选中后相机聚焦到对应 3D 实例。
- [x] 实现基础 instancing、LOD、拾取映射和静态资源释放；禁止由显示名推导硬件身份。
- [ ] 建立积木展示场景与全景/近景/选中/阻塞的截图检查，核对几何、标识、端口和光照。

**完成条件：** 同一份定义可生成多种容量/实例；旋转后连接点仍准确；近景可读、远景可辨；无持续无意义闪烁；真实运行标识与美术预览分离。

### M3 — 拓扑驱动的 XYZ 城市生成器（依赖 M1、M2）

- [x] 用 `apps/game` 替换旧 viewer 主入口，新增 `packages/world`；同步更新 workspace、构建和启动脚本，移除 editor 主路径。
- [x] 对数据流节点执行稳定拓扑排序和最长路径分层，以 X 轴表达 producer→consumer 顺序；scope 使用 Z 轴泳道，rank 内通过双向 barycenter sweep 减少交叉，连线使用正交路由；每条场景连接必须回指唯一 topology edge。
- [x] `parentId` 生成嵌套城区/街区/模块层次；容器从直接子节点计算展示包围盒，树视图、3D 分区和检查器路径使用同一父链。
- [x] 完成三维分块、局部坐标、相机、搜索、切片/展开和路径聚焦；不依赖有限大小的旧地板或固定城区坐标。
- [x] 支持 topology 导入、schema/语义诊断和只读节点检查；布局偏好单独保存且不能修改 topology hash。

**完成条件：** 对同一拓扑重复生成得到相同节点坐标和边路由；拓扑边与场景连接 1:1；每个节点具有合法面积记录；父子节点位于匹配的嵌套分区；导入后无身份/连接丢失；在 XYZ 正负方向跨块生成后仍能准确定位和拾取。

### M4 — 确定性回放与 Tile 追踪（依赖 M1；可与 M2/M3 并行）

- [x] Hard-break 重建 `packages/trace-runtime` 的 current bundle 按需读取、事件归约、checkpoint restore/seek 和 Worker 协议；所有 u64 保持字符串，Queue、Tile residency/allocation epoch、association 和 compute 状态进入纯 JSON snapshot。
- [x] 游戏接入 Worker 回放，支持播放、暂停、单周期步进、0.5×–4×、无损 cycle 跳转、范围诊断和 latest-request-wins；100 个快速 seek 只有最后请求发布结果。
- [x] Queue occupancy/slot 驱动管道数据块，Tile residency 驱动具体 storage bank/slot 与标签；检查器支持 token/Queue → Tile/storage 及 storage → token/Queue 导航，渲染帧只插值 snapshot 派生状态。
- [x] 独立 oracle 覆盖同周期 phase/sequence、反压、flush、reset、跨 bank、多副本、部分写、地址复用、move/release、窗口边界和 truncation/loss 契约；固定 seed 的 100 次随机 checkpoint seek 与顺序回放 state hash 一致。

**完成条件：** 对固定 seed 的至少 100 个随机周期，顺序回放与 checkpoint seek 的规范化状态 hash 一致；快速连续 seek 只显示最后结果；改变相机、布局、帧率和播放速度不改变给定周期的状态。

### M5 — 首条真实仿真链路与可审阅演示（依赖 M3、M4）

- [x] 对 M0 选定的实际来源补充只读观测与新格式 producer adapter；先贯通一个受支持的后端，再验证第二个后端，不等待整个 DavinciOO 完成。
- [x] 在真实模型存在的边界上贯通“请求入队 → 存储访问 → Tile 驻留 → 计算 → 写回”；数据缺口通过实际 instrumentation 补齐。
- [x] 固定至少一个正常场景和一个确实产生队列反压或 bank conflict 的场景；保存源码/配置/workload hash、生成命令、事件计数与采集覆盖。
- [x] 新站点首屏采用这一精品小场景；实现积木、时间轴、槽位/驻留和状态检查联动。

**完成条件：** 用户能在浏览器选择一条指令及其 Tile，定位真实等待原因和存储位置；采集开关不改变模型功能结果或模拟周期；页面所示关键状态由独立 trace/model 证据逐项核对。仅播放 synthetic 场景不能关闭本里程碑。

### M6 — 全目录城市与层级拓扑（依赖 M5）

- [x] 将 240 项映射接入游戏组件库；实现 7 个城区、31 个子系统的可折叠层级、搜索、来源和能力标识。
- [ ] 补全可实例化模块的参数化外观与端口；contained-state、interface、alias、unresolved 按所属对象呈现。
- [ ] 支持参数化复合拓扑、多核/多 PE 实例及跨块连接；ID、owner 和状态不会因展开冲突。

**完成条件：** 自动清单证明 240/240 候选均可从 UI 定位到正确对象/owner/说明；没有把未实现模块标为已运行，也没有为了凑数制造独立状态；真实 trace 覆盖率单独报告。

### M7 — 运行、挑战与改进闭环（依赖 M5；完整交付结合 M6）

- [ ] 新建 `tools/sim-runner` 和 `packages/scenarios`：声明受支持的 backend、workload、参数范围、配置导出与结果绑定。
- [ ] 提供本机 runner 的启动、连接、任务状态、取消、失败诊断和结果导入；配置变更使旧结果标为旧 run，必须重新仿真才能生成新指标。
- [ ] 至少完成三个引导挑战：解释拓扑、定位队列瓶颈、分析并改善 bank conflict 或 Tile 搬运；每项有固定 topology/config、可执行参数范围和独立完成判据。
- [ ] 对相同 workload 的两次真实 run 显示周期、吞吐、等待或冲突等可观测指标；不以动画速度或渲染计数作为得分。
- [ ] 纯静态部署明确区分“查看已录制结果”和“连接 runner 后重跑”。

**完成条件：** 至少一个挑战能够在受支持 backend 上完成“改参数 → 导出配置 → 重跑 → 导入新结果 → 可重现地改善指定指标”；不支持的拓扑被预先诊断，不退回伪仿真。

### M8 — 大场景、回归、旧实现清除与发行（依赖 M6、M7）

- [ ] 在 M0 固定的参考机/浏览器上测量 1440×900、DPR=1、固定画质/镜头路径：至少 240 个可渲染实例、20,000 个槽位/存储单元、1,000 个活动令牌、1,000,000 个 trace 事件。此处 240 实例是性能负载，不等同于候选目录的 240 项。
- [ ] 初始验收目标：预热后 60 秒路径的帧耗时 p95 ≤ 25 ms；100 次随机 warm seek 的响应 p95 ≤ 500 ms；连续 30 分钟播放/切换不崩溃；分块缓存配置上限且无随总 trace 长度持续增长的驻留。记录 CPU/GPU/内存/长任务与原始测量结果。
- [ ] 对 XYZ 各轴 ±1,000,000 个场景单位的跨区编辑、连线和重载运行 fixture，验证逻辑坐标/ID 不变、拾取正确；聚焦后几何不抖动。该测试是大坐标验证，不宣称无限容量。
- [ ] 浏览器 E2E 覆盖拓扑生成、搜索/选择、导入错误、run 失配、trace seek、Tile 定位、挑战闭环和 runner 断连；至少检查 Chromium、Firefox、Safari 的首发核心流程与降级说明。
- [ ] 完成 M0 删除清单，清除旧入口、专用布局、兼容 reader、旧 demo、无效文档链接、过时依赖与构建产物；替换默认 trace 与截图。
- [ ] 更新 CI、Pages 构建、README、快速开始、trace/蓝图格式、runner 使用和性能报告；发布前执行新站点 smoke test。

**完成条件：** 新游戏是唯一启动/发行路径；所有语义、交互、视觉和性能验收有证据，所有 hard-break 删除项完成。性能目标未达成时先优化或公开修改范围，不能静默降低负载/画质或只报告平均 FPS。

## 工作分工与依赖

| 实施线    | 主要责任与路径                                                                                     | 交接点                       |
| --------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| 产品/视觉 | `DESIGN.md`、`docs/game`、视觉基准                                                                 | M0；M2/M5/M8 视觉验收        |
| 契约/目录 | `packages/component-catalog`、`packages/topology`、`packages/trace-schema`、`tools/catalog-import` | M1 冻结可用接口；M6 清单闭合 |
| 拓扑/渲染 | `packages/brick-kit`、`packages/scene-core`、`packages/world`、`apps/game`                         | M2 → M3 → M5                 |
| 仿真/回放 | `packages/trace-runtime`、`sdk/cpp`、`tools/linxtrace`、`tools/sim-runner` 及来源仓 adapter        | M1 → M4 → M5 → M7            |
| 独立验证  | `tests`、`fixtures`、浏览器 E2E、性能/视觉证据、CI                                                 | 每个里程碑验收；M8 发行检查  |

新增路径是计划目标，现有路径可按边界重建或替换。每次分派必须固定 base revision、实际 assignee/reviewer、写范围、命令、预算和完成条件，禁止两个实施者同时修改共享 schema 或运行共享可变仿真输出。

## 验证与关闭清单

现有 CI 已执行 JS 检查/构建和 C++ SDK 测试，重建后保留等效质量门，并新增针对游戏的验收入口；下列新增命令由对应里程碑实现，不能作为当前已有能力宣称。

现有基础命令：

```sh
npm ci
npm run check
npm run build
npm run pages:verify
cmake -S sdk/cpp -B build/sdk -DBUILD_TESTING=ON
cmake --build build/sdk --parallel
ctest --test-dir build/sdk --output-on-failure
```

新增验收脚本：`npm run catalog:check`、`npm run trace:verify`、`npm run test:e2e`、`npm run test:visual`、`npm run perf:city`、`npm run audit:hard-break`。真实 producer 另附固定 revision/config/workload 的生成与对照命令，禁止仅凭前端测试替代仿真证据。当前 CI 依据：[ci.yml](https://github.com/LinxISA/LinxSimCity/blob/7a324fa6f98638d6fbff4754df1ca31e99ee92a7/.github/workflows/ci.yml#L7-L25)。

- [ ] M0–M8 均由对应 PR 和验收证据关闭。
- [ ] 精制组件、拓扑生成、真实 trace、队列反压与 Tile 驻留在同一个网页产品内贯通。
- [ ] 240/240 目录映射完成；可运行/可观测覆盖另有真实统计。
- [ ] 至少一个可重跑的优化挑战闭环完成，三个引导挑战可用。
- [ ] 缺失观测、旧格式、失配 run、未支持组合均有明确诊断。
- [ ] 旧实现和兼容路径退出发行；新文档、示例、CI、性能与视觉证据完整。

## 主要风险与处理

| 风险                                  | 处理                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------- |
| 240 候选被误当成 240 个可运行模块     | M1 建归属与能力清单；M6 分开验收目录覆盖和真实 trace 覆盖                   |
| 图好看但看不清内部流动/存储           | M2 先做精制近景；M5 必须完成指令→Tile→具体 bank/slot 的真实定位             |
| 仿真缺观测或不同 backend 阶段语义不同 | producer adapter 明确采集能力，先补最小链路；未知状态不通过 UI 推测补齐     |
| 拓扑包含模拟器未支持的结构            | 拓扑校验与后端能力表分开；M7 只承诺明确支持的配置变换和 workload            |
| 百万事件、大量槽位压垮浏览器          | Worker、增量归约、分块缓存、instancing、LOD 与相机相对坐标；M8 固定负载实测 |
| hard break 变成删除测试掩盖回归       | 删除清单逐项对应新行为与保留的不变量，独立 oracle 先覆盖，再替换旧实现      |

首个演示交付是 **M5 的精品真实链路**；只有静态城市截图或旧 viewer 换皮不能视为该改造完成。
