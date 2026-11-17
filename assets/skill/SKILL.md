---
name: prd-dev-view
description: 把业务 PRD 结合现有代码整理成面向研发的 PRD 研发视图，并在代码调整后同步进度。
---

# PRD 研发视图（插件版）

把业务方的 PRD 和现有代码对照后，整理成**一份数据文件**（`*.prdview.json`）。用户在会话顶部的「研发视图」页签里看功能矩阵、完整功能卡片、冲突与改造总清单、业务全貌、影响地图和共用规则；HTML 只是导出的只读快照。

## 样例与隐私边界

随插件提供的编号、路径和「申请单」案例均为虚构教学示例，只用于说明数据结构与关联方式，不代表任何客户、项目或已核验的代码现状。生成正式内容时必须以当前绑定视图的 PRD 和代码证据为准，不继承样例的结论或排除项。对外分享样例时应使用虚构的项目名称、人员、分支和代码路径，不附带真实客户信息、内部业务规则、问题结论或本机用户目录；脱敏样例不得覆盖用户的实际 PRD 或视图数据。

## 铁律

1. **数据只通过工具修改。** 读用 `prd_view`，改用 `prd_view_edit`。不要用 write / edit / PowerShell 改 `.prdview.json` 或导出的 HTML（守卫会拒绝，HTML 每次保存后自动重新生成）。
2. **完成项标记完成，不删除。** 问题用 `progress` 改成 resolved / wontfix / superseded，改造改成 done / verified / dropped / superseded，并写 `reason`（完成依据，能写提交号就写 `commit`）。没有删除操作；误录或重复的条目用 superseded（`by` 指向保留的条目）或 wontfix 并说明原因。
3. **关联只改一处。** 问题、调整、模块与功能的关系只存在条目的 `features` 字段里；改造的前置问题存在 `blocked`。功能侧列表、计数、看板、卡片里的引用都是推导出来的，不要试图“同步修改多处”。
4. **一个对话只负责一份视图。** 先用 `prd_view action=projects` 看本对话绑定的视图（用户在会话头部右侧的「研发视图」选择器选择；项目 `.dsh/prd-views` 中有视图时默认绑定第一份）。修改类操作只能作用于绑定的视图，`project` 可省略。未绑定时只能只读查询，模型不能自行绑定；需要修改时请用户在选择器绑定，或在研发视图页签「新建并绑定」。
5. **代码改了就同步。** 修改了绑定视图所在项目的代码后：`prd_view action=sync` → 对每个待复核条目读对应代码 → 用 `prd_view_edit` 更新进度/字段，并对结论不变的条目用 `review` 写复核说明 → 全部复核后 `prd_view action=baseline` 推进基线。
6. 用户是开发人员：讲清业务、指出需要改什么，不讲类和方法怎么实现。类名、方法名、文件路径只写进 `code`、`prdRef`、`evidence` 这类依据字段，正文用业务话。
7. 用户已确认的本期排除项不算缺陷，也不拉低相关功能的完成状态；排除范围以当前项目的明确确认内容为准，不沿用样例中的业务决定。
8. 回复和数据都用中文。正文只写结论，不写“本轮分析”“待核查”之类过程话；事实边界只在 `meta.scopeNote` 写 1～2 句。

## 常用流程

### 新建一份研发视图
1. 确认输入：PRD 文档是视图托管的 Markdown 文件，路径见 `prd_view action=summary` 返回的 `prdFile`，引用的图片在 `prdImages` 目录（图片承载流程图、原型和表格时用读图工具查看）。PRD 文档和图片只读，不要修改；PRD 有新版本时由用户在页签「总览」从原文件更新或更换。另确认代码分支或版本（用户告知）、本期排除项。
2. 通读 PRD 全文（含字段表备注、删除线、待确认、流程/权限/状态表，记行号），逐个功能核对代码现状（入口 → 权限 → 状态 → 校验 → 保存 → 回调 → 下游读者）。
3. 目标视图由用户在研发视图页签「新建并绑定」（建在项目的 `.dsh/prd-views/` 下，跟随项目共享和版本管理）；本对话没有绑定时先请用户这样做。把整理好的数据写成一份 JSON 草稿（放在临时位置，文件名不要以 `.prdview.json` 结尾），结构见下文“数据结构”，然后 `prd_view action=import source=<草稿绝对路径> dataFile=<绑定视图的数据文件> branch=<分支>`（项目内视图不需要 repo，代码仓库就是所在项目）。
4. `prd_view action=lint`，错误清零，提醒逐条看；之后 `prd_view action=sync` 设定代码基线。
5. 功能多时分批：先导入功能与横切数据，再用 `prd_view_edit` 的 `card` 操作逐个补完整卡片，每批跑一次 lint。

### 内容生成进度（不是业务实现进度）

视图文件创建或 PRD 托管完成，只代表**视图已创建，内容待生成**；有功能标题、已有卡片数量、导入成功或业务条目「已完成」，都不等于研发视图内容已经生成完成。

使用 `prd_view action=generation` 向本对话绑定的视图上报，参数为 `phase`、必填的具体阶段说明 `detail`，以及可选 `featureIds`（完整的计划功能编号列表）、`completedFeatureIds`（本批已写入并确认完整的卡片编号）、`error`（失败原因）。此操作只保存生成状态，不修改业务数据；卡片与业务内容仍经 `prd_view_edit` / `import` 保存。

- **开始时**先上报 `phase=reading`，说明正在读取哪些 PRD 输入。首次读取尚未明确范围时不传 `featureIds`，总量显示为未确定，不能拿当前已导入的功能数量冒充总量。
- **阶段变化时**上报真实阶段：`reading`（阅读 PRD）、`code`（核对代码）、`cards`（生成和补齐卡片）、`checking`（最终检查）。整理出完整功能清单后用 `featureIds` 上报整个计划；计划调整时重传完整清单，不传增量，不通过缩减计划掩盖未完成内容。
- **每批卡片保存后**上报 `phase=cards` 和该批 `completedFeatureIds`，编号会累计去重。只能确认实际写入、已核对的卡片；系统还会验证对应功能、标题和说明、至少 3 个具名阶段、前置条件以及后续各阶段的完整步骤。只有标题、空卡或未保存草稿不能计入完成数。
- **检查结束时**先完成 lint 错误修复、逐条处理提醒和需要的基线设置，再上报 `phase=complete`。系统重新调用 lint，要求 errors 为零、计划与实际功能清单完全一致、每个功能均已明确确认且卡片基本完整，否则拒绝完成并记录失败原因；以成功回执为准，不能在拒绝后仍向用户声称完成。
- **失败或明确暂停时**分别上报 `phase=failed` 或 `phase=interrupted`，在 `detail` / `error` 写清原因与尚未完成内容。恢复原计划可直接上报真实工作阶段；终态后上报 `reading` 会开始新一轮、清空原计划和确认记录，应重新提交计划并确认卡片。

生成进度是**最近一次阶段上报**，不是实时监控。界面展示最近上报时间；Host 重启会把原运行阶段标为 interrupted。无法可靠检测 agent 自然停下时，不猜测它仍在工作或已经完成，也不伪造进度百分比。最终 complete 后业务数据有新修订，旧完成结论需要重新检查。

### 迁移旧版 HTML
`prd_view action=import source=<旧 HTML 绝对路径> repo=<代码目录>`。导入时合并双向关系、去掉场景演示，旧 HTML 原样保留，新快照导出到同目录的新文件。

### 评审与更新
- `prd_view action=summary`（filter：open / closed / all / review / block）看总清单；`action=items ids=[...]` 看条目全文；`action=card feature=F-01` 看完整卡片。
- 用户在页签里也能直接标记完成或答复，和工具走同一个操作。
- 修改后的工具回执列出：改了什么、连带变化（功能剩余问题/改造数、解除阻塞、计数）以及检查结果，向用户汇报时以回执为准。

## 编辑操作（prd_view_edit.ops）

| 操作 | 用途 |
|---|---|
| `{op:"progress",kind,id,to,reason,commit?,answer?,by?}` | 改进度；关闭必须写 reason |
| `{op:"set",kind,id,fields}` | 改普通字段（标题、where/impact/suggest、now/after、性质等）；`kind:"meta"` 改 PRD 信息 |
| `{op:"link"/"unlink",kind,id,field?,target}` | 改关联；field 默认 features，改造的前置问题用 blocked，规则/模块可用 q、adj |
| `{op:"add",kind,item}` | 新增条目；问题/改造编号可省略 |
| `{op:"card",feature,patch}` | 改完整卡片的栏目（整栏替换） |
| `{op:"evidence",kind,id,evidence:[{path,symbol?,lines?}]}` | 设置代码证据锚点，sync 按它判断受影响条目 |
| `{op:"review",kind,id,note}` | 代码变化后复核，结论不变时写明原因 |

一批操作整体生效或整体拒绝。数据被别人改过时会报修订冲突，重新读取后再改。

## 数据结构

顶层：`meta`、`objs`、`caps`、`features`、`issues`、`adjustments`、`rules`、`modules`、`objects`、`chain`、`lifecycle`、`objMap`、`cards`。导入草稿也可以直接使用旧版常量名（`PRD_META`、`OBJS`、`CAPS`、`FEAT`、`QS`、`ADJ`、`GRULES`、`MODS`、`OBJ`、`CHAIN`、`LIFECYCLE`、`OBJ_MAP`、`DEEP`）。

- `meta`：`title`、`prdHref`、`branch`、`codeNote`、`scopeNote`、`badge`、`repo`；`baseline` 由同步维护。
- `objs` / `caps`：功能矩阵的行（业务对象）和列（能力类型，默认 新增/修改/删除/查询/流程/版本与历史/引用与关联/自动处理/对外接口）。元素为 `{id,name,sub?}` 或字符串。
- `features`：`{id,name,obj,cap,status,prd,now,todo,rel,prdRef,code}`；status 为 new/change/minor/ok/pending（新增/改造/小改/无需改/待定）。**一个能力只归一个功能**，不要同时保留端到端大功能和拆出来的子功能。
- `issues`：`{id,type,sev,title,features,prd,where,impact,suggest,code,evidence}`；type 冲突/缺失/笔误，sev block/impact/low。建议只写在问题里；一个问题只讲一件事。
- `adjustments`：`{id,title,status,features,blocked,now,after,evidence}`；status（性质）merge/new/change/pending/confirm/defer/ok。“当前 → 改后”写系统行为变化和大致处理步骤。
- `rules`：`{id,name,desc,uses:{功能:ok|miss|q|new},note,q,adj}`。
- `modules`：`{id,name,sub,io,need,features,adj,q,note,code}`；need ok/new/change/confirm/pending。
- `objects`：本 PRD 管理的业务对象 `{id,name,sub,features,note}`。
- `chain`：`[{name,steps:[{f,t}]}]`。
- `lifecycle`：`{title,start:[{f}],states:[{name,note,items:[{f,label?}|{text}]}],gaps:[{fwd,back,extra}],loops:[{from,to,f,label}],always:[{f}]}`；gaps 数 = 状态数 − 1；每个功能都要出现在状态主线上。
- `objMap`：`{width,height,nodes:{编号:[x,y,标题,副标题]},edges:[[起,终,标签]]}`。
- `cards[功能编号]`（每个功能都要有）：
  - `title`、`meta`（`[[标签,值]]`）、`lead`、`banner`（`{adj,text}`）、`codeNote`、`note`
  - `stages`：`[{id,name,sub,desc}]`，至少 3 个；**第 1 个阶段只放前置条件**
  - `pre`：`[{id,cond,act,msg,note,links,prd,code}]`
  - `rules`：`[{id,name,when,what,fail,status,extra,prd,code}]`；提示文案按代码原文；每条规则都要挂在判断它的步骤上
  - `steps`：`{阶段id:[{id,t,d,tag,rules,links}]}`；tag 沿用/调整/缺口/需改
  - `adj` / `qs`：`[{id,span:[起,止],ends?,links}]`，文字取自全局条目；功能关联的每个问题和调整都要在卡片里有位置
  - `compat`：`[{id,name,impact,need,status,regress,span,links,prd,code}]`
  - `related`：`[{id,links}]`
  - 不再需要场景演示（scenarios / mock）。

编号：功能、问题、调整、规则、模块、对象全局唯一；P、R、S、C 只在本卡片内唯一。`links` 写卡片内编号或全局编号，页签里点击会画连线。

## 交付说明

简短说明用法（在「研发视图」页签查看，双击功能开卡片），按阻塞程度列主要问题，说明检查结果和事实边界（静态读代码、未运行等），只问一个问题。
