/* PRD 研发视图插件 · Client 端：会话视图页签「研发视图」与设置页「PRD 研发视图」。
 * 数据与操作全部来自 Host（/api/prd-view.*），界面只渲染与发起操作。 */
window.__ModuleLoader__.load({
  id: 'dsh-prd-dev-view',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, Fragment } = React
    const NS = 'prdDevView'
    const VIEW_ID = 'prd-dev-view'

    // ------------------------------------------------------------ 文案
    const zh = {
      'tab': '研发视图', 'settings.nav': 'PRD 研发视图',
      'bind.label': '研发视图', 'bind.aria': '本对话绑定的研发视图', 'bind.none': '无', 'bind.missing': '（已绑定的视图找不到）',
      'bind.groupProject': '本项目 .dsh/prd-views', 'bind.groupRegistered': '其他已登记',
      'bind.scopeProject': '本项目', 'bind.scopeRegistered': '已登记',
      'bind.tipBound': '本对话绑定：{title}', 'bind.tipDefault': '（按项目目录自动绑定，选「无」可取消）', 'bind.tipNone': '本对话未绑定研发视图：不会修改任何视图，也不会收到同步提醒',
      'bind.unboundTitle': '本对话未绑定研发视图', 'bind.unboundLead': '绑定后，本对话才会修改这份视图、在代码改动后提醒同步；其他对话不受影响。也可以在右上角随时切换或选「无」。',
      'bind.unboundMissing': '之前绑定的视图文件找不到了（可能被移动或删除）。请重新绑定或新建。',
      'bind.pickTitle': '绑定已有视图', 'bind.pick': '绑定',
      'bind.createTitle': '新建研发视图', 'bind.noCwd': '本对话没有工作目录，无法确定项目位置；保存位置请填绝对路径。',
      'bind.nameLabel': '视图名称', 'bind.namePh': '例如：申请单管理（示例）', 'bind.create': '新建并绑定',
      'bind.locLabel': '保存位置', 'bind.locReset': '恢复默认', 'bind.locAbs': '使用绝对路径（不在项目视图目录内的视图会登记到本机）。', 'bind.creating': '正在创建…', 'bind.locNote': '相对项目根目录 {root}，也可填绝对路径；默认位置在「设置 › PRD 研发视图」中修改。',
      'bind.locPreview': '将创建：',
      'bind.createNote': 'PRD 文档和它引用的本地图片会复制到视图目录统一管理，并在本机记住原文件位置，PRD 改了可一键更新。新建后输入框会预填一句请求，确认后发送，由模型按技能生成内容。',
      'bind.draft': '请根据 PRD 文档（{prd}）结合当前代码，生成研发视图「{title}」。',
      'prd.label': 'PRD 文档', 'prd.pathPh': '粘贴 .md 文件的完整路径，例如 D:\\文档\\产品PRD.md',
      'prd.pathHint': '只支持 Markdown（.md）。在资源管理器中按住 Shift 右键文件，选「复制文件地址」后粘贴。文档引用的本地图片会一起复制。',
      'prd.checking': '正在检查文档和图片…', 'prd.gbk': '已按 GBK 编码读取并转为 UTF-8', 'prd.noImages': '没有引用本地图片',
      'prd.imagesCopy': '{n} 张图片将一起复制（{size}）', 'prd.remote': '{n} 张网络图片保持原链接', 'prd.missingN': '{n} 张图片找不到，仍可继续（点开查看）',
      'prd.line': '第 {n} 行', 'prd.times': '（引用 {n} 次）', 'prd.notImageN': '{n} 处引用的不是图片文件，保持原链接（点开查看）', 'prd.sourceAt': '原文件：{path}', 'prd.sourceUnknown': '本机没有记录原文件位置，可用「更换 PRD」重新指定', 'prd.more': '还有 {n} 张未列出', 'prd.imagesN': '{n} 张图片', 'prd.missingShort': '{n} 张图片缺失',
      'prd.fileGone': '（文件不存在，请重新关联）', 'prd.current': 'PRD：', 'prd.missing': '未关联 PRD 文档', 'prd.attach': '关联 PRD 文档…', 'prd.replace': '更换 PRD…',
      'prd.refresh': '从原文件更新', 'prd.refreshTip': '重新读取原文件并复制图片：{path}', 'prd.sourceGone': '原文件已不存在：{path}。请用「更换 PRD」重新指定', 'prd.updating': '处理中…',
      'prd.doReplace': '更换', 'prd.doAttach': '关联', 'prd.replaceNote': '旧文档和图片会从视图目录移除（如已提交到版本库，可从历史找回）',
      'prd.confirmReplace': '用「{name}」替换当前的 PRD 文档？旧文档和图片会从视图目录移除（如已提交到版本库，可从历史找回）。',
      'prd.unchanged': '原文件没有变化', 'prd.imagesCopied': '复制了 {n} 张图片', 'prd.missingWarn': '{n} 张图片找不到：{list}',
      'prd.done.关联': '已关联 PRD 文档：{file}', 'prd.done.更换': '已更换 PRD 文档：{file}。可让模型据此更新研发视图。', 'prd.done.更新': '已从原文件更新 PRD 文档：{file}。可让模型据此更新研发视图。',
      'set.viewsDir': '新建视图默认位置', 'set.viewsDirDesc': '相对项目根目录的路径（默认 .dsh/prd-views），也可填绝对路径。对话按这个位置查找项目里的研发视图，新建时默认保存到这里。',
      'nav.summary': '总览', 'nav.features': '功能', 'nav.list': '清单', 'nav.overview': '全貌', 'nav.rules': '规则',
      'sum.block': '阻塞问题（需先和业务确认）', 'sum.review': '待复核（代码有改动）', 'sum.dist': '功能性质分布', 'sum.top': '剩余工作最多的功能', 'sum.recent': '最近变更',
      'sum.none': '暂无', 'sum.all': '在清单中查看全部', 'sum.distNote': '共 {n} 个功能',
      'top.project': '研发视图', 'top.search': '搜索编号、标题、功能…', 'top.refresh': '刷新', 'top.sync': '同步代码', 'top.export': '导出 HTML',
      'top.rev': '修订', 'top.noBaseline': '未设代码基线', 'top.noRepo': '未配置代码仓库', 'top.codeChanged': '代码自基线起改动 {n} 个文件',
      'top.review': '{n} 项待复核', 'top.baseline': '基线',
      'stat.issuesOpen': '未关闭问题', 'stat.block': '阻塞', 'stat.adjOpen': '未完成改造', 'stat.closed': '已完成', 'stat.review': '待复核',
      'empty.title': '还没有可显示的研发视图', 'empty.body': '在「设置 › PRD 研发视图」里导入旧版 HTML 或登记数据文件，或让模型调用 prd_view 导入。',
      'empty.openSettings': '打开设置后在左侧选择「PRD 研发视图」',
      'loading': '加载中…', 'error': '出错了', 'retry': '重试',
      'filter.status': '性质', 'filter.blockOnly': '只看有阻塞问题', 'filter.reviewOnly': '只看待复核', 'filter.all': '全部',
      'matrix.hint': '单击选中并点亮关联，双击打开完整卡片',
      'matrix.corner': '业务对象 ＼ 能力', 'matrix.count': '{n} 个功能', 'legend.q': '未关闭问题', 'legend.a': '未完成改造',
      'list.type': '类型', 'list.typeAll': '全部', 'list.typeIssue': '冲突与缺失', 'list.typeAdj': '改造',
      'list.progress': '进度', 'list.open': '未完成', 'list.closed': '已完成', 'list.allProgress': '全部',
      'list.group': '分组', 'group.none': '不分组', 'group.feature': '按功能', 'group.sev': '按影响', 'group.nature': '按性质', 'group.progress': '按进度',
      'list.closedFold': '已完成 {n} 项（保留不删除）', 'list.col.id': '编号', 'list.col.kind': '类型', 'list.col.title': '标题', 'list.col.level': '影响 / 性质',
      'list.col.progress': '进度', 'list.col.features': '功能', 'list.col.flags': '标记', 'list.col.changed': '最近变更', 'list.empty': '没有符合条件的条目',
      'flag.review': '待复核', 'flag.blocked': '等 {ids}',
      'card.back': '返回', 'card.full': '完整卡片', 'card.simple': '简版卡片', 'card.missing': '这个功能还没有完整卡片',
      'layer.steps': '处理步骤与规则', 'layer.adj': '需要调整', 'layer.qs': '冲突与缺失', 'layer.compat': '兼容影响', 'layer.related': '相关功能',
      'card.pre': '前置条件', 'card.prd': 'PRD 要求', 'card.now': '当前系统情况', 'card.todo': '需要做的事', 'card.issues': '冲突与缺失', 'card.adjs': '需要调整',
      'card.stage': '阶段 →', 'card.rules': '共用规则', 'card.mods': '影响模块', 'card.related': '相关功能', 'card.lineHint': '点击步骤、规则或条目查看连线；再次点击取消',
      'overview.lifecycle': '状态主线', 'overview.always': '任何状态都可以', 'overview.loops': '回退', 'overview.chain': '核心数据链', 'overview.map': '业务对象关系',
      'overview.start': '起点',
      'impact.center': '本 PRD', 'impact.legend': '颜色表示对已有模块的改动程度', 'impact.table': '已有模块',
      'rules.col': '共用规则', 'rules.legend': '✔ 已使用　✖ 该用没用　? 待确认　○ 功能未实现',
      'rules.mk.ok': '已遵守', 'rules.mk.miss': '该用没用', 'rules.mk.q': '待确认', 'rules.mk.new': '功能未实现',
      'rules.howto': '点规则行（或其中任一格）看规则涉及哪些功能，点功能列头看该功能受哪些规则约束',
      'rules.focusFeature': '{id} {name}：受 {n} 条规则约束', 'rules.focusRule': '{id} {name}：涉及 {n} 个功能', 'rules.clear': '取消选中',
      'rules.applies': '涉及 {n} 个功能', 'rules.missN': '{n} 处缺失', 'rules.qN': '{n} 处待确认',
      'drawer.close': '关闭', 'drawer.openCard': '打开完整卡片', 'drawer.quote': '引用到输入框', 'drawer.quoted': '已插入输入框',
      'drawer.quoteFallback': '已复制到剪贴板，可粘贴到输入框', 'drawer.history': '变更历史', 'drawer.evidence': '依据', 'drawer.features': '关联功能',
      'drawer.blocks': '等它确认的改造', 'drawer.blockedBy': '先等这些问题', 'drawer.where': '冲突或缺失在哪', 'drawer.impact': '影响', 'drawer.suggest': '建议',
      'drawer.answer': '答复', 'drawer.now': '当前', 'drawer.after': '改后', 'drawer.reason': '说明（关闭时必填）', 'drawer.answerPh': '业务答复内容',
      'drawer.reviewTitle': '代码有改动，需复核', 'drawer.reviewFiles': '命中文件', 'drawer.reviewNote': '复核说明（结论为何仍成立或已如何更新）',
      'drawer.reviewOk': '确认已复核', 'drawer.closeHint': '“已解决 / 已完成 / 已验证 / 不处理 / 放弃”需先填写说明；条目关闭后保留，不会删除。', 'drawer.saving': '保存中…', 'drawer.saved': '已保存', 'drawer.code': '代码位置', 'drawer.prdRef': 'PRD 位置',
      'drawer.when': '何时判断', 'drawer.what': '判断什么', 'drawer.fail': '不通过时', 'drawer.extra': '说明', 'drawer.msg': '提示', 'drawer.act': '处理',
      'drawer.cond': '条件', 'drawer.need': '需要做的', 'drawer.regress': '回归', 'drawer.desc': '说明', 'drawer.modules': '模块', 'drawer.uses': '使用情况',
      'act.answered': '已答复', 'act.resolved': '已解决', 'act.wontfix': '不处理', 'act.reopen': '重新打开', 'act.doing': '开始处理', 'act.done': '已完成',
      'act.verified': '已验证', 'act.dropped': '放弃', 'act.needReason': '关闭条目需要填写说明',
      'p.open': '待确认', 'p.answered': '已答复', 'p.resolved': '已解决', 'p.wontfix': '不处理', 'p.superseded': '被取代',
      'p.todo': '待处理', 'p.doing': '进行中', 'p.done': '已完成', 'p.verified': '已验证', 'p.dropped': '放弃',
      'fs.new': '新增', 'fs.change': '改造', 'fs.minor': '小改', 'fs.ok': '无需改', 'fs.pending': '待定',
      'sev.block': '阻塞开发', 'sev.impact': '影响行为', 'sev.low': '文档问题',
      'an.merge': '合并', 'an.new': '新增', 'an.change': '改造', 'an.pending': '待定', 'an.confirm': '需确认', 'an.defer': '延期', 'an.ok': '无需改',
      'need.ok': '无需改', 'need.new': '新增', 'need.change': '需改动', 'need.confirm': '需确认', 'need.pending': '待定',
      'kind.issue': '问题', 'kind.adjustment': '改造',
      'toast.synced': '同步完成：{files} 个文件改动，新标记 {n} 项待复核', 'toast.baselineSet': '已设定代码基线', 'toast.exported': '已导出：{file}',
      'set.title': 'PRD 研发视图', 'set.desc': '登记研发视图数据文件、导入旧版 HTML，并设置修改保护与代码同步。',
      'set.projects': '已登记的研发视图', 'set.none': '还没有登记任何研发视图', 'set.dataFile': '数据文件', 'set.htmlFile': '导出 HTML', 'set.repo': '代码仓库',
      'set.baseline': '代码基线', 'set.counts': '问题 {q}/{qt} 未关闭 · 改造 {a}/{at} 未完成', 'set.missingFile': '数据文件不存在',
      'set.edit': '编辑', 'set.save': '保存', 'set.cancel': '取消', 'set.export': '导出 HTML', 'set.unregister': '取消登记', 'set.confirmUnregister': '只取消登记，不删除文件。确定取消登记「{t}」吗？',
      'set.import': '导入或登记', 'set.importPath': '来源路径（旧版 HTML、JSON 草稿或 .prdview.json）', 'set.importRepo': '代码仓库路径（可选）',
      'set.importBranch': '代码分支说明（可选）', 'set.importBtn': '导入', 'set.importDone': '已导入：{file}',
      'set.options': '选项', 'set.autoExport': '修改后自动重新导出 HTML', 'set.autoExportDesc': '每次编辑保存后，用只读模板重新生成 HTML 快照。',
      'set.guard': '拦截直接修改', 'set.guardDesc': '拒绝模型用 write / edit 直接改数据文件和生成的 HTML，只能走编辑工具。',
      'set.reminder': '改代码时提醒同步', 'set.reminderDesc': '会话里改了登记仓库中的文件后，提醒模型同步研发视图。',
      'set.gitPath': 'git 可执行文件', 'set.registryDir': '登记表目录（留空使用默认）', 'set.saveOptions': '保存选项', 'set.saved': '已保存，插件将重新加载',
      'set.registryFile': '登记表文件：{f}', 'set.copyPath': '复制路径',
    }
    const en = {
      'tab': 'Dev view', 'settings.nav': 'PRD dev view',
      'bind.label': 'Dev view', 'bind.aria': 'Dev view bound to this conversation', 'bind.none': 'None', 'bind.missing': '(bound view not found)',
      'bind.groupProject': 'This project .dsh/prd-views', 'bind.groupRegistered': 'Other registered',
      'bind.scopeProject': 'Project', 'bind.scopeRegistered': 'Registered',
      'bind.tipBound': 'Bound to: {title}', 'bind.tipDefault': '(bound automatically from the project folder; choose None to unbind)', 'bind.tipNone': 'No dev view bound: this conversation will not modify views or get sync reminders',
      'bind.unboundTitle': 'No dev view bound to this conversation', 'bind.unboundLead': 'Once bound, only this conversation modifies the view and gets sync reminders after code changes. Switch or choose None at the top right at any time.',
      'bind.unboundMissing': 'The previously bound view file can no longer be found. Bind or create one again.',
      'bind.pickTitle': 'Bind an existing view', 'bind.pick': 'Bind',
      'bind.createTitle': 'Create a dev view', 'bind.noCwd': 'This conversation has no working directory; enter an absolute save location.',
      'bind.nameLabel': 'View name', 'bind.namePh': 'e.g. Typical product architecture', 'bind.create': 'Create and bind',
      'bind.locLabel': 'Save location', 'bind.locReset': 'Reset', 'bind.locAbs': 'Absolute path (views outside the project view folder are registered on this machine).', 'bind.creating': 'Creating…', 'bind.locNote': 'Relative to the project root {root}, or an absolute path; change the default in Settings › PRD dev view.',
      'bind.locPreview': 'Will create:',
      'bind.createNote': 'The PRD document and the local images it references are copied into the view folder; the source location is remembered on this machine for one-click updates. A request is prefilled in the composer afterwards; send it to let the model build the view.',
      'bind.draft': 'Build the dev view "{title}" from the PRD document ({prd}) and the current code.',
      'prd.label': 'PRD document', 'prd.pathPh': 'Paste the full path of the .md file, e.g. D:\\Docs\\Product PRD.md',
      'prd.pathHint': 'Markdown (.md) only. In Explorer, Shift+right-click the file and choose "Copy as path". Local images it references are copied too.',
      'prd.checking': 'Checking the document and images…', 'prd.gbk': 'Read as GBK and converted to UTF-8', 'prd.noImages': 'No local images referenced',
      'prd.imagesCopy': '{n} images will be copied ({size})', 'prd.remote': '{n} web images keep their links', 'prd.missingN': '{n} images not found; you can still continue (expand)',
      'prd.line': 'line {n}', 'prd.times': '(referenced {n} times)', 'prd.notImageN': '{n} references are not image files and keep their links (expand)', 'prd.sourceAt': 'Source: {path}', 'prd.sourceUnknown': 'Source location not recorded on this machine; use Replace PRD', 'prd.more': '{n} more not listed', 'prd.imagesN': '{n} images', 'prd.missingShort': '{n} images missing',
      'prd.fileGone': ' (file missing, attach again)', 'prd.current': 'PRD: ', 'prd.missing': 'No PRD document attached', 'prd.attach': 'Attach PRD document…', 'prd.replace': 'Replace PRD…',
      'prd.refresh': 'Update from source', 'prd.refreshTip': 'Re-read the source file and copy images: {path}', 'prd.sourceGone': 'Source file no longer exists: {path}; use Replace PRD', 'prd.updating': 'Working…',
      'prd.doReplace': 'Replace', 'prd.doAttach': 'Attach', 'prd.replaceNote': 'The old document and images are removed from the view folder (recover from version history if committed)',
      'prd.confirmReplace': 'Replace the current PRD document with "{name}"? The old document and images are removed from the view folder (recover from version history if committed).',
      'prd.unchanged': 'The source file has not changed', 'prd.imagesCopied': '{n} images copied', 'prd.missingWarn': '{n} images not found: {list}',
      'prd.done.关联': 'PRD document attached: {file}', 'prd.done.更换': 'PRD document replaced: {file}. Ask the model to update the dev view.', 'prd.done.更新': 'PRD document updated from source: {file}. Ask the model to update the dev view.',
      'set.viewsDir': 'Default location for new views', 'set.viewsDirDesc': 'Path relative to the project root (default .dsh/prd-views), or an absolute path. Conversations look for project views here and new views are saved here by default.',
      'nav.summary': 'Summary', 'nav.features': 'Features', 'nav.list': 'Checklist', 'nav.overview': 'Overview', 'nav.rules': 'Rules',
      'sum.block': 'Blocking issues (need business input)', 'sum.review': 'To review (code changed)', 'sum.dist': 'Feature nature', 'sum.top': 'Most remaining work', 'sum.recent': 'Recent changes',
      'sum.none': 'None', 'sum.all': 'Open all in checklist', 'sum.distNote': '{n} features in total',
      'top.project': 'Dev view', 'top.search': 'Search id, title, feature…', 'top.refresh': 'Refresh', 'top.sync': 'Sync code', 'top.export': 'Export HTML',
      'top.rev': 'rev', 'top.noBaseline': 'No code baseline', 'top.noRepo': 'No repository', 'top.codeChanged': '{n} files changed since baseline',
      'top.review': '{n} to review', 'top.baseline': 'Baseline',
      'stat.issuesOpen': 'Open issues', 'stat.block': 'Blocking', 'stat.adjOpen': 'Open changes', 'stat.closed': 'Closed', 'stat.review': 'To review',
      'empty.title': 'No dev view to show', 'empty.body': 'Import a legacy HTML or register a data file in Settings › PRD dev view, or ask the model to call prd_view.',
      'empty.openSettings': 'Open Settings and choose “PRD dev view”',
      'loading': 'Loading…', 'error': 'Error', 'retry': 'Retry',
      'filter.status': 'Nature', 'filter.blockOnly': 'Blocked only', 'filter.reviewOnly': 'To review only', 'filter.all': 'All',
      'matrix.hint': 'Click to highlight relations, double-click to open the full card',
      'matrix.corner': 'Object \\ capability', 'matrix.count': '{n} features', 'legend.q': 'Open issues', 'legend.a': 'Open changes',
      'list.type': 'Type', 'list.typeAll': 'All', 'list.typeIssue': 'Issues', 'list.typeAdj': 'Changes',
      'list.progress': 'Progress', 'list.open': 'Open', 'list.closed': 'Closed', 'list.allProgress': 'All',
      'list.group': 'Group', 'group.none': 'None', 'group.feature': 'Feature', 'group.sev': 'Impact', 'group.nature': 'Nature', 'group.progress': 'Progress',
      'list.closedFold': '{n} closed (kept, never deleted)', 'list.col.id': 'ID', 'list.col.kind': 'Type', 'list.col.title': 'Title', 'list.col.level': 'Impact / nature',
      'list.col.progress': 'Progress', 'list.col.features': 'Features', 'list.col.flags': 'Flags', 'list.col.changed': 'Last change', 'list.empty': 'No matching items',
      'flag.review': 'Review', 'flag.blocked': 'Waits for {ids}',
      'card.back': 'Back', 'card.full': 'Full card', 'card.simple': 'Simple card', 'card.missing': 'This feature has no full card yet',
      'layer.steps': 'Steps and rules', 'layer.adj': 'Changes', 'layer.qs': 'Issues', 'layer.compat': 'Compatibility', 'layer.related': 'Related features',
      'card.pre': 'Preconditions', 'card.prd': 'PRD requirement', 'card.now': 'Current system', 'card.todo': 'To do', 'card.issues': 'Issues', 'card.adjs': 'Changes',
      'card.stage': 'Stage →', 'card.rules': 'Shared rules', 'card.mods': 'Modules', 'card.related': 'Related features', 'card.lineHint': 'Click a step, rule or item to draw its links',
      'overview.lifecycle': 'Lifecycle', 'overview.always': 'Any state', 'overview.loops': 'Rollbacks', 'overview.chain': 'Core data chain', 'overview.map': 'Business objects',
      'overview.start': 'Start',
      'impact.center': 'This PRD', 'impact.legend': 'Color shows how much each existing module must change', 'impact.table': 'Existing modules',
      'rules.col': 'Shared rule', 'rules.legend': '✔ used　✖ missing　? to confirm　○ not implemented',
      'rules.mk.ok': 'Applied', 'rules.mk.miss': 'Missing', 'rules.mk.q': 'To confirm', 'rules.mk.new': 'Not implemented',
      'rules.howto': 'Click a rule row to see its features; click a feature header to see its rules',
      'rules.focusFeature': '{id} {name}: constrained by {n} rules', 'rules.focusRule': '{id} {name}: covers {n} features', 'rules.clear': 'Clear selection',
      'rules.applies': 'Covers {n} features', 'rules.missN': '{n} missing', 'rules.qN': '{n} to confirm',
      'drawer.close': 'Close', 'drawer.openCard': 'Open full card', 'drawer.quote': 'Quote in composer', 'drawer.quoted': 'Inserted into the composer',
      'drawer.quoteFallback': 'Copied to clipboard', 'drawer.history': 'History', 'drawer.evidence': 'Evidence', 'drawer.features': 'Features',
      'drawer.blocks': 'Changes waiting for it', 'drawer.blockedBy': 'Waits for', 'drawer.where': 'Where', 'drawer.impact': 'Impact', 'drawer.suggest': 'Suggestion',
      'drawer.answer': 'Answer', 'drawer.now': 'Now', 'drawer.after': 'After', 'drawer.reason': 'Reason (required when closing)', 'drawer.answerPh': 'Business answer',
      'drawer.reviewTitle': 'Code changed, review needed', 'drawer.reviewFiles': 'Matched files', 'drawer.reviewNote': 'Review note',
      'drawer.reviewOk': 'Mark reviewed', 'drawer.closeHint': 'Closing actions need a reason; closed items are kept, never deleted.', 'drawer.saving': 'Saving…', 'drawer.saved': 'Saved', 'drawer.code': 'Code', 'drawer.prdRef': 'PRD',
      'drawer.when': 'When', 'drawer.what': 'Checks', 'drawer.fail': 'On failure', 'drawer.extra': 'Note', 'drawer.msg': 'Message', 'drawer.act': 'Action',
      'drawer.cond': 'Condition', 'drawer.need': 'Needed', 'drawer.regress': 'Regression', 'drawer.desc': 'Description', 'drawer.modules': 'Modules', 'drawer.uses': 'Usage',
      'act.answered': 'Answered', 'act.resolved': 'Resolved', 'act.wontfix': "Won't fix", 'act.reopen': 'Reopen', 'act.doing': 'Start', 'act.done': 'Done',
      'act.verified': 'Verified', 'act.dropped': 'Drop', 'act.needReason': 'A reason is required to close an item',
      'p.open': 'Open', 'p.answered': 'Answered', 'p.resolved': 'Resolved', 'p.wontfix': "Won't fix", 'p.superseded': 'Superseded',
      'p.todo': 'To do', 'p.doing': 'In progress', 'p.done': 'Done', 'p.verified': 'Verified', 'p.dropped': 'Dropped',
      'fs.new': 'New', 'fs.change': 'Change', 'fs.minor': 'Minor', 'fs.ok': 'No change', 'fs.pending': 'Pending',
      'sev.block': 'Blocking', 'sev.impact': 'Behavior', 'sev.low': 'Document',
      'an.merge': 'Merge', 'an.new': 'New', 'an.change': 'Change', 'an.pending': 'Pending', 'an.confirm': 'Confirm', 'an.defer': 'Deferred', 'an.ok': 'No change',
      'need.ok': 'No change', 'need.new': 'New', 'need.change': 'Change', 'need.confirm': 'Confirm', 'need.pending': 'Pending',
      'kind.issue': 'Issue', 'kind.adjustment': 'Change',
      'toast.synced': 'Synced: {files} files changed, {n} newly marked for review', 'toast.baselineSet': 'Code baseline set', 'toast.exported': 'Exported: {file}',
      'set.title': 'PRD dev view', 'set.desc': 'Register dev-view data files, import legacy HTML, and configure edit protection and code sync.',
      'set.projects': 'Registered dev views', 'set.none': 'No dev view registered yet', 'set.dataFile': 'Data file', 'set.htmlFile': 'Exported HTML', 'set.repo': 'Repository',
      'set.baseline': 'Baseline', 'set.counts': 'Issues {q}/{qt} open · changes {a}/{at} open', 'set.missingFile': 'Data file is missing',
      'set.edit': 'Edit', 'set.save': 'Save', 'set.cancel': 'Cancel', 'set.export': 'Export HTML', 'set.unregister': 'Unregister', 'set.confirmUnregister': 'Files are kept. Unregister “{t}”?',
      'set.import': 'Import or register', 'set.importPath': 'Source path (legacy HTML, JSON draft or .prdview.json)', 'set.importRepo': 'Repository path (optional)',
      'set.importBranch': 'Branch note (optional)', 'set.importBtn': 'Import', 'set.importDone': 'Imported: {file}',
      'set.options': 'Options', 'set.autoExport': 'Re-export HTML after edits', 'set.autoExportDesc': 'Regenerates the read-only HTML snapshot after every saved edit.',
      'set.guard': 'Block direct edits', 'set.guardDesc': 'Denies write / edit on data files and generated HTML so changes go through the edit tool.',
      'set.reminder': 'Remind to sync after code edits', 'set.reminderDesc': 'After a session edits a file in a registered repository, reminds the model to sync.',
      'set.gitPath': 'git executable', 'set.registryDir': 'Registry directory (blank for default)', 'set.saveOptions': 'Save options', 'set.saved': 'Saved; the plugin will reload',
      'set.registryFile': 'Registry file: {f}', 'set.copyPath': 'Copy path',
    }

    // ------------------------------------------------------------ 样式
    Object.assign(zh, {
  "home.open": "研发视图",
  "home.tip": "打开研发视图右侧栏，不发送消息",
  "home.narrow": "请先扩宽窗口（至少 768px）；窄屏的原生侧栏会变成全屏，本入口不会打开遮罩。",
  "home.busy": "等待侧栏就绪…",
  "create.new": "新建",
  "create.existing": "已有视图",
  "create.branch": "分支说明（仅元数据，不切换分支或创建工作树）",
  "create.working": "任务由后台继续执行；收起侧栏不会取消。",
  "create.status": "任务状态",
  "create.stage": "阶段",
  "create.files": "文件 {done} / {total}",
  "create.bytes": "字节 {done} / {total}",
  "create.retryBind": "绑定这份已创建视图并完成（不重新复制）",
  "create.failed": "创建未完成；请核实错误后重新提交。",
  "create.draftReady": "生成请求已填入空草稿，请检查后自行发送。",
  "create.draftKept": "现有草稿未被覆盖。可显式插入生成请求。",
  "create.insert": "插入生成请求（追加，不发送）",
  "create.empty": "没有可绑定的已有视图。",
  "generation.label": "生成进度（最后上报，非实时推测）",
  "generation.updated": "更新于",
  "generation.reading": "读取文档与代码",
  "generation.code": "对照代码",
  "generation.cards": "生成功能卡片",
  "generation.checking": "检查一致性",
  "generation.complete": "生成完成",
  "generation.failed": "生成失败",
  "generation.interrupted": "生成中断",
  "generation.pending": "内容待生成",
  "create.queued": "排队中",
  "create.running": "执行中",
  "create.waiting-session": "等待会话",
  "create.failedStatus": "失败",
  "create.interrupted": "已中断",
  "create.completed": "已完成",
  "create.inspect": "检查文档",
  "create.copy": "复制文档与图片",
  "create.save": "保存视图",
  "create.bind": "绑定会话",
  "create.complete": "完成"
})
    Object.assign(en, {
  "home.open": "Dev view",
  "home.tip": "Open the development view sidebar without sending a message",
  "home.narrow": "Widen the window to at least 768px first. Native sidebars become fullscreen on narrow screens; this entry will not open an overlay.",
  "home.busy": "Waiting for sidebar…",
  "create.new": "New",
  "create.existing": "Existing",
  "create.branch": "Branch note (metadata only; no checkout or worktree creation)",
  "create.working": "The task continues in the background when the sidebar is collapsed.",
  "create.status": "Task status",
  "create.stage": "Stage",
  "create.files": "Files {done} / {total}",
  "create.bytes": "Bytes {done} / {total}",
  "create.retryBind": "Bind this created view and complete (no copying again)",
  "create.failed": "Creation is incomplete. Review the error before submitting again.",
  "create.draftReady": "The generation request was added to the empty draft. Review and send it yourself.",
  "create.draftKept": "Your existing draft was preserved. Insert the generation request explicitly if wanted.",
  "create.insert": "Insert generation request (append, do not send)",
  "create.empty": "No existing views are available.",
  "generation.label": "Generation progress (last reported, not inferred live)",
  "generation.updated": "Updated",
  "generation.reading": "Reading documents and code",
  "generation.code": "Comparing code",
  "generation.cards": "Generating feature cards",
  "generation.checking": "Checking consistency",
  "generation.complete": "Generation complete",
  "generation.failed": "Generation failed",
  "generation.interrupted": "Generation interrupted",
  "generation.pending": "Content awaits generation",
  "create.queued": "Queued",
  "create.running": "Running",
  "create.waiting-session": "Waiting for session",
  "create.failedStatus": "Failed",
  "create.interrupted": "Interrupted",
  "create.completed": "Completed",
  "create.inspect": "Inspecting document",
  "create.copy": "Copying document and images",
  "create.save": "Saving view",
  "create.bind": "Binding session",
  "create.complete": "Complete"
})

    Object.assign(zh, { 'create.another': '再新建一份', 'generation.unavailable': '暂时无法读取最后上报状态', 'create.resetNote': '将开启新的创建任务，已有视图保留。' })
    Object.assign(en, { 'create.another': 'Create another view', 'generation.unavailable': 'Last reported state is unavailable', 'create.resetNote': 'Start a new creation task; existing views are kept.' })
    Object.assign(zh, { 'notice.expand': '查看详情', 'notice.collapse': '收起详情', 'notice.close': '关闭提示', 'notice.reported': '最后上报', 'notice.pending': '尚无生成上报；请检查对话，按需发送生成请求。' })
    Object.assign(en, { 'notice.expand': 'Show details', 'notice.collapse': 'Hide details', 'notice.close': 'Dismiss notice', 'notice.reported': 'Last reported', 'notice.pending': 'No generation report yet. Check the conversation and send a generation request if needed.' })
    const CSS = `
.pdv{
--pdv-fg:var(--dsw-alias-label-primary,#111);--pdv-fg2:var(--dsw-alias-label-secondary,#555);--pdv-fg3:var(--dsw-alias-label-tertiary,#888);
--pdv-bg:var(--dsw-alias-bg-base,#fff);--pdv-surface:var(--dsw-alias-card-fill,#f6f7f9);--pdv-hover:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));
--pdv-line:var(--dsw-alias-border-l3,rgba(0,0,0,.12));--pdv-line2:var(--dsw-alias-border-l2,rgba(0,0,0,.08));--pdv-strong:var(--dsw-alias-border-l4,rgba(0,0,0,.18));
--pdv-ink:var(--dsw-alias-brand-primary,#111);--pdv-accent:var(--dsw-alias-state-business-primary,#3b6cf6);
--pdv-err:var(--dsw-alias-state-error-primary,#dc2626);--pdv-warn:var(--dsw-alias-state-warn-primary,#d97706);--pdv-ok:var(--dsw-alias-state-success-primary,#16a34a);
--pdv-violet:var(--dsw-alias-state-done-primary,#7c3aed);--pdv-idle:var(--dsw-alias-state-idle-primary,#9ca3af);
--pdv-shadow:0 1px 2px rgba(0,0,0,.06);--pdv-th:color-mix(in srgb,var(--pdv-fg) 6%,var(--pdv-bg));
color:var(--pdv-fg);background:var(--pdv-bg);font-size:13px;line-height:1.5;height:100%;display:flex;flex-direction:column;min-height:0;position:relative}
.pdv *{box-sizing:border-box}
.pdv button{font:inherit;color:inherit;cursor:pointer}
.tint{background:color-mix(in srgb,var(--c) 10%,var(--pdv-bg))}
/* ---------- 顶部：标题区 ---------- */
.pdv-head{padding:4px 12px;border-bottom:1px solid var(--pdv-strong);background:var(--pdv-surface)}
.pdv-head{display:flex;align-items:center;gap:4px 12px;flex-wrap:wrap}
.pdv-title{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;flex:0 1 auto}
.pdv-title-select{font:inherit;font-size:16px;font-weight:700;color:var(--pdv-fg);background:transparent;border:0;border-radius:6px;padding:2px 4px;margin-left:-4px;min-width:0;max-width:min(300px,100%);cursor:pointer}
.pdv-title-select:focus-visible{outline:2px solid var(--pdv-accent);outline-offset:1px}
.pdv-title-text{margin:0;font-size:16px;font-weight:700;color:var(--pdv-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:min(300px,100%);padding:2px 0}
/* ---------- 未绑定 ---------- */
.pdv-unbound{max-width:720px;margin:0 auto;padding:20px 16px;overflow:auto;width:100%;box-sizing:border-box}.pdv-dock{height:100%;overflow:hidden}.pdv-dock .pdv-unbound{height:100%;overflow:hidden;display:flex;flex-direction:column}.pdv-dock .pdv-create-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}.pdv-dock .pdv-unbound{max-width:100%;min-width:0}.pdv-dock section,.pdv-create-footer{min-width:0;overflow-wrap:anywhere}.pdv-create-scroll input{min-width:0;width:100%}.pdv-create-footer{flex:none;border-top:1px solid var(--pdv-line);padding-top:10px}.pdv-create-footer section{margin:0 0 8px;padding:8px}.pdv-create-footer p{margin:4px 0}.pdv-create-footer .pdv-btn.pri{width:100%}.pdv-mode{display:flex;gap:8px;margin:12px 0}.pdv-notices{min-width:0;flex:none;border-bottom:1px solid var(--pdv-line);font-size:12px}.pdv-notice-row{display:flex;align-items:center;gap:6px;min-width:0;padding:3px 12px;white-space:nowrap}.pdv-notice-summary{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pdv-notice-row button{flex:none}.pdv-notice-details{max-height:180px;overflow:auto;overflow-wrap:anywhere;padding:4px 12px 8px}.pdv-notice-details p{margin:4px 0}.pdv-notice-row[data-warning=true]{color:var(--pdv-warn)}.pdv-create-footer .pdv-notices{padding:0;margin:0;border:0;border-radius:0}
.pdv-unbound h3{margin:0 0 4px;font-size:16px}
.pdv-unbound .lead{color:var(--pdv-fg2);margin:0 0 20px}
.pdv-unbound section{border:1px solid var(--pdv-line);border-radius:10px;padding:14px 16px;margin-bottom:14px;background:var(--pdv-bg)}
.pdv-unbound section h4{margin:0 0 10px;font-size:13px}
.pdv-unbound .opt{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--pdv-line2)}
.pdv-unbound .opt:first-of-type{border-top:0}
.pdv-unbound .opt .tx{flex:1;min-width:0}
.pdv-unbound .opt .tx b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdv-unbound .opt .tx small{display:block;color:var(--pdv-fg3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace)}
.pdv-unbound .scope{font-size:11px;padding:0 6px;border-radius:4px;background:var(--pdv-surface);color:var(--pdv-fg2);flex:none}
.pdv-unbound .field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;font-size:12px;color:var(--pdv-fg2)}
.pdv-unbound .field .pdv-input{width:100%}
.pdv-unbound .where{font-size:12px;color:var(--pdv-fg3);margin:0 0 10px;word-break:break-all}
.pdv-unbound .where code{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);color:var(--pdv-fg2)}
.pdv-unbound .msg{font-size:12px;margin-top:8px;color:var(--pdv-err)}
.pdv-unbound .req{color:var(--pdv-err)}
.pdv-unbound .loc{display:flex;align-items:center;gap:8px;min-width:0}
.pdv-unbound .loc .pdv-input{flex:1;min-width:0}
.prd-path{display:flex;flex-direction:column;gap:6px;min-width:0}
.prd-path .pdv-input{width:100%;font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:12px}
.prd-res{font-size:12px;border-radius:6px;padding:6px 10px;line-height:1.6;min-width:0;word-break:break-all}
.prd-res.ok{background:color-mix(in srgb,var(--pdv-ok) 8%,var(--pdv-bg));border:1px solid color-mix(in srgb,var(--pdv-ok) 30%,var(--pdv-line));color:var(--pdv-fg2)}
.prd-res.ok b{color:var(--pdv-fg)}
.prd-res.ok small{color:var(--pdv-fg3)}
.prd-res.err{background:color-mix(in srgb,var(--pdv-err) 8%,var(--pdv-bg));border:1px solid color-mix(in srgb,var(--pdv-err) 35%,var(--pdv-line));color:var(--pdv-err)}
.prd-res .miss{margin-top:4px;color:var(--pdv-warn)}
.prd-res .miss summary{cursor:pointer;font-weight:600}
.prd-res .miss ul{margin:4px 0 0;padding-left:18px;color:var(--pdv-fg2)}
.prd-res code{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:11.5px}
.pdv-prdbar{margin-bottom:12px;padding:8px 10px;border-radius:8px;border:1px solid var(--pdv-line2);font-size:12px}
.pdv-prdbar .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.pdv-prdbar .prd{display:inline-flex;align-items:center;gap:6px;min-width:0;flex:1;color:var(--pdv-fg2)}
.pdv-prdbar .prd b{color:var(--pdv-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}
.pdv-prdbar .prd.none{color:var(--pdv-warn)}
.pdv-prdbar .src{margin-top:4px;font-size:11.5px;color:var(--pdv-fg3);word-break:break-all;font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace)}
.pdv-prdbar .src.gone{color:var(--pdv-warn)}
.prd-res .miss.other{color:var(--pdv-fg2)}
.pdv-prdform{margin-top:8px;padding-top:8px;border-top:1px dashed var(--pdv-line);display:flex;flex-direction:column;gap:8px}
.pdv-title-select:hover{background:var(--pdv-hover)}
.pdv-sub{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;margin:0 0 0 auto;min-width:0;font-size:12px;color:var(--pdv-fg3)}
.pdv-sub .branch{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdv-head{flex:none}
.pdv-head-actions{display:flex;align-items:center;gap:6px;flex:none}
.pdv-head .pdv-sub{font-size:11px}
.pdv-head .pdv-nav{max-width:100%;overflow-x:auto;flex:none}
.pdv-sub .dot{width:3px;height:3px;border-radius:50%;background:var(--pdv-fg3)}
.pdv-kpis{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.pdv-kpi{display:flex;flex-direction:column;justify-content:center;min-width:104px;padding:6px 12px;border-radius:10px;background:var(--pdv-bg);border:1px solid var(--pdv-line2);border-left:3px solid var(--c,var(--pdv-line));text-align:left;cursor:pointer}
.pdv-kpi:hover{border-color:var(--pdv-strong);border-left-color:var(--c,var(--pdv-strong))}
.pdv-kpi.on{border-color:var(--pdv-fg);border-left-color:var(--c);box-shadow:0 0 0 1px var(--pdv-fg)}
.pdv-kpi .v{font-size:18px;font-weight:700;line-height:1.15;color:var(--c,var(--pdv-fg));font-variant-numeric:tabular-nums}
.pdv-kpi .v small{font-size:12px;font-weight:500;color:var(--pdv-fg3);margin-left:2px}
.pdv-kpi .l{font-size:12px;color:var(--pdv-fg2)}
.pdv-kpi.zero .v{color:var(--pdv-fg3)}
.pdv-nav{display:flex;align-items:flex-end;gap:4px}
.pdv-tab{border:0;background:none;padding:6px 10px;color:var(--pdv-fg2);border-bottom:2px solid transparent;font-size:13px;white-space:nowrap;flex:none}
.pdv-tab:hover{color:var(--pdv-fg)}
.pdv-tab.on{color:var(--pdv-fg);border-bottom-color:var(--pdv-accent);font-weight:700}
.pdv-tab .n{margin-left:5px;font-size:11px;padding:0 6px;border-radius:999px;background:var(--pdv-surface);color:var(--pdv-fg2);font-weight:500}
/* ---------- 控件 ---------- */
.pdv-select,.pdv-input,.pdv-textarea{font:inherit;color:var(--pdv-fg);background:var(--pdv-bg);border:1px solid var(--pdv-line);border-radius:6px;padding:4px 8px;outline:none}
.pdv-select:focus,.pdv-input:focus,.pdv-textarea:focus{border-color:var(--pdv-accent)}
.pdv-input.search{width:230px}
.pdv-textarea{width:100%;min-height:54px;resize:vertical}
.pdv-btn{border:1px solid var(--pdv-line);background:var(--pdv-bg);border-radius:6px;padding:3px 10px;white-space:nowrap}
.pdv-btn:hover{background:var(--pdv-hover)}
.pdv-btn:disabled{opacity:.5;cursor:default}
.pdv-btn.pri{background:var(--pdv-ink);border-color:var(--pdv-ink);color:var(--pdv-bg)}
.pdv-btn.ghost{border-color:transparent;background:transparent}
.pdv-btn.danger{color:var(--pdv-err)}
.pdv-spacer{flex:1}
.pdv-badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:0 8px;font-size:12px;line-height:20px;border:1px solid var(--pdv-line);color:var(--pdv-fg2);white-space:nowrap;background:var(--pdv-bg)}
.pdv-badge.warn{--c:var(--pdv-warn);border-color:var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 10%,var(--pdv-bg))}
.pdv-badge.err{--c:var(--pdv-err);border-color:var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 10%,var(--pdv-bg))}
.pdv-badge.ok{--c:var(--pdv-ok);border-color:var(--c);color:var(--c)}
.pdv-badge.click{cursor:pointer}
.pdv-body{flex:1;display:flex;min-height:0}
.pdv-main{flex:1;overflow:auto;padding:14px 16px 16px;min-width:0}
.pdv-drawer{flex:none;width:380px;min-height:0;overflow:auto;overscroll-behavior:contain;border-left:1px solid var(--pdv-strong);padding:14px 16px 16px;background:var(--pdv-bg)}
.pdv-kpis.big{gap:12px;margin-bottom:16px}
.pdv-kpis.big .pdv-kpi{min-width:150px;padding:12px 16px}
.pdv-kpis.big .pdv-kpi .v{font-size:30px}
.pdv-tab .n.alert{background:var(--pdv-err);color:var(--pdv-bg);font-weight:700}
.pdv-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:900px){.pdv-grid2{grid-template-columns:minmax(0,1fr)}}
.pdv-grid2 .pdv-sec{margin-bottom:0}
.pdv-lrow{display:flex;align-items:baseline;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;border-bottom:1px solid var(--pdv-line2)}
.pdv-lrow:hover{background:var(--pdv-hover)}
.pdv-lrow .ttl{flex:1;min-width:0;font-weight:600}
.pdv-lrow .tail{flex:none;font-size:11.5px;color:var(--pdv-fg3)}
.pdv-sec>h3 .pdv-cnt{margin-left:auto}
.pdv-dist{display:flex;height:16px;border-radius:8px;overflow:hidden;gap:2px;background:var(--pdv-line2)}
.pdv-dist span{background:var(--c);min-width:6px}
.pdv-logrow{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--pdv-line2);font-size:12.5px}
.pdv-logrow .ttl{flex:1;min-width:0;color:var(--pdv-fg2)}
.pdv-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:7px 10px;border-radius:8px;border:1px solid var(--pdv-line2);background:transparent;font-size:12px;color:var(--pdv-fg2)}
.pdv-bar .lbl{color:var(--pdv-fg3)}
.pdv-bar .sep{width:1px;height:16px;background:var(--pdv-line)}
.pdv-seg{display:inline-flex;border:1px solid var(--pdv-line);border-radius:6px;overflow:hidden;background:var(--pdv-bg)}
.pdv-seg button{border:0;background:none;padding:2px 10px;font-size:12px;color:var(--pdv-fg2)}
.pdv-seg button+button{border-left:1px solid var(--pdv-line2)}
.pdv-seg button.on{background:var(--pdv-ink);color:var(--pdv-bg);font-weight:600}
.pdv-check{display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.pdv-hint{color:var(--pdv-fg3);font-size:12px}
.pdv-empty{padding:60px 20px;text-align:center;color:var(--pdv-fg2)}
.pdv-empty h3{margin:0 0 6px;color:var(--pdv-fg);font-size:15px}
.pdv-legend{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--pdv-fg2)}
.pdv-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--c);margin-right:4px;vertical-align:-1px}
/* ---------- 语义色 ---------- */
.st-new{--c:var(--pdv-accent)}.st-change{--c:var(--pdv-warn)}.st-minor{--c:color-mix(in srgb,var(--pdv-warn) 50%,var(--pdv-fg3))}.st-ok{--c:var(--pdv-ok)}.st-pending{--c:var(--pdv-idle)}
.sev-block{--c:var(--pdv-err)}.sev-impact{--c:var(--pdv-warn)}.sev-low{--c:var(--pdv-idle)}
.k-feature{--k:var(--pdv-accent)}.k-issue{--k:var(--pdv-err)}.k-adjustment{--k:var(--pdv-warn)}.k-rule{--k:var(--pdv-violet)}.k-module{--k:var(--pdv-fg2)}.k-object{--k:var(--pdv-ok)}
.pg-open,.pg-todo{--p:var(--pdv-fg3)}.pg-answered,.pg-doing{--p:var(--pdv-accent)}.pg-resolved,.pg-done,.pg-verified{--p:var(--pdv-ok)}
.pg-wontfix,.pg-dropped,.pg-superseded{--p:var(--pdv-idle)}
.pdv-pill{display:inline-block;border-radius:4px;padding:0 6px;font-size:11px;line-height:18px;font-weight:600;color:var(--c,var(--pdv-fg2));background:color-mix(in srgb,var(--c,var(--pdv-fg3)) 14%,var(--pdv-bg));white-space:nowrap}
.pdv-pill.solid{background:var(--c);color:var(--pdv-bg)}
.pdv-kind{display:inline-block;border-radius:4px;padding:0 6px;font-size:11px;line-height:18px;font-weight:600;color:var(--k);border:1px solid color-mix(in srgb,var(--k) 45%,transparent);white-space:nowrap}
.pdv-prog{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--p);white-space:nowrap;font-weight:500}
.pdv-prog:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--p)}
.pg-open.pdv-prog:before,.pg-todo.pdv-prog:before{background:transparent;border:1.5px solid var(--p);width:6px;height:6px}
.pdv-id{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:11.5px;color:var(--pdv-fg3);font-weight:500}
/* ---------- 高亮 ---------- */
.pdv-dimmable{transition:opacity .15s}
.pdv.has-sel .pdv-mwrap .pdv-dimmable:not(.is-rel):not(.is-sel),.pdv.has-sel .pdv-cgrid .pdv-dimmable:not(.is-rel):not(.is-sel),
.pdv.has-sel .pdv-sec .pdv-dimmable:not(.is-rel):not(.is-sel),.pdv.has-sel .pdv-rwrap .pdv-dimmable:not(.is-rel):not(.is-sel){opacity:.35}
.pdv .is-sel{outline:2px solid var(--pdv-fg);outline-offset:1px}
.pdv .is-rel{box-shadow:0 0 0 2px var(--pdv-accent),var(--pdv-shadow)}
.pdv .pdv-drawer .is-rel{box-shadow:none}
.pdv .pdv-table tr.is-sel td{background:color-mix(in srgb,var(--pdv-accent) 10%,var(--pdv-bg))}
.pdv .pdv-table tr.is-sel{outline:0}
.pdv :focus-visible{outline:2px solid var(--pdv-accent);outline-offset:1px}
.is-hit{background:color-mix(in srgb,var(--pdv-warn) 22%,var(--pdv-bg))!important}
.is-recent{animation:pdv-flash 1.6s ease-out 1}
@keyframes pdv-flash{0%{box-shadow:0 0 0 3px var(--pdv-warn)}100%{box-shadow:0 0 0 0 transparent}}
/* ---------- 功能矩阵 ---------- */
.pdv-mwrap,.pdv-cgrid-wrap,.pdv-rwrap{max-height:calc(100vh - 290px);min-height:240px;overflow:auto}
.pdv-mwrap{border:1px solid var(--pdv-line);border-radius:10px;background:var(--pdv-bg)}
.pdv-main.matrix-page{display:flex;flex-direction:column}
.matrix-page>.pdv-bar,.matrix-page>.pdv-hint{flex:none}
.matrix-page>.pdv-mwrap{flex:1;min-height:180px;max-height:none}
.matrix-page .pdv-matrix{height:100%}
.pdv-rwrap{border:1px solid var(--pdv-line);border-radius:10px}
.pdv-rwrap .pdv-table{table-layout:auto;border-collapse:separate;border-spacing:0}
.pdv-rwrap .pdv-table th{top:0}
.pdv-rwrap .pdv-table th:not(:first-child),.pdv-rwrap .pdv-table td:not(:first-child){min-width:104px}
.pdv-rwrap .pdv-table td:first-child,.pdv-rwrap .pdv-table th:first-child{width:260px;min-width:260px;max-width:260px;white-space:normal;overflow-wrap:anywhere;position:sticky;left:0;background:var(--pdv-bg);z-index:2;border-right:1px solid var(--pdv-strong)}
.pdv-rwrap .pdv-table th:first-child{z-index:3;background:var(--pdv-th)}
/* 规则表：行 = 规则，列 = 功能；选中用底色十字标识，不用描边 */
.pdv-rtable th.fh{width:104px;max-width:120px;white-space:normal;vertical-align:bottom;cursor:pointer;font-weight:500}
.pdv-rtable th.fh .fn{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11.5px;color:var(--pdv-fg2);line-height:1.35;margin-top:2px}
.pdv-rtable th.fh:not(.col-on):hover{background:color-mix(in srgb,var(--pdv-fg) 10%,var(--pdv-bg))}
.pdv-rtable td{border-bottom:1px solid var(--pdv-line2)}
.pdv-rtable td.mc{text-align:center;vertical-align:middle;border-left:1px solid var(--pdv-line2)}
.pdv-rtable td.rn b{color:var(--pdv-fg)}
.pdv-rtable td.rn .desc{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px}
.pdv-rtable td.rn .sum{margin-top:4px;font-size:11.5px;color:var(--pdv-fg3)}
.pdv-rtable td.rn .sum .bad{color:var(--pdv-err);font-weight:600}
.pdv-rtable td.rn .sum .warn{color:var(--pdv-warn);font-weight:600}
.pdv-rk{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:12px;font-weight:700;line-height:1}
.pdv-rk.rk-ok{color:var(--pdv-ok);background:color-mix(in srgb,var(--pdv-ok) 12%,var(--pdv-bg))}
.pdv-rk.rk-miss{color:var(--pdv-err);background:color-mix(in srgb,var(--pdv-err) 14%,var(--pdv-bg))}
.pdv-rk.rk-q{color:var(--pdv-warn);background:color-mix(in srgb,var(--pdv-warn) 14%,var(--pdv-bg))}
.pdv-rk.rk-new{color:var(--pdv-fg3);border:1px dashed var(--pdv-line)}
.pdv-rtable .col-on{background:color-mix(in srgb,var(--pdv-accent) 7%,var(--pdv-bg))}
.pdv-rtable th.col-on{background:color-mix(in srgb,var(--pdv-accent) 14%,var(--pdv-bg));color:var(--pdv-fg)}
.pdv-rtable th.col-sel{box-shadow:inset 0 -3px 0 var(--pdv-accent)}
.pdv-rtable th.col-sel .pdv-id,.pdv-rtable th.col-sel .fn{color:var(--pdv-fg);font-weight:700}
.pdv-rtable tr.row.row-sel td{background:color-mix(in srgb,var(--pdv-accent) 10%,var(--pdv-bg))}
.pdv .pdv-rtable tr.row:hover td{background:var(--pdv-hover)}
.pdv .pdv-rtable tr.row:hover td.col-on{background:color-mix(in srgb,var(--pdv-accent) 11%,var(--pdv-bg))}
.pdv .pdv-rtable tr.row.row-sel td{background:color-mix(in srgb,var(--pdv-accent) 10%,var(--pdv-bg))}
.pdv .pdv-rtable tr.row.row-sel td.col-on{background:color-mix(in srgb,var(--pdv-accent) 18%,var(--pdv-bg))}
.pdv .pdv-rtable tr:focus-visible,.pdv .pdv-rtable th:focus-visible{outline:2px dashed var(--pdv-fg2);outline-offset:-2px}
.pdv-rwrap .pdv-rtable tr.row:not(.row-sel):hover td.rn{background:color-mix(in srgb,var(--pdv-fg) 4%,var(--pdv-bg))}
.pdv-rwrap .pdv-rtable tr.row-sel td.rn{box-shadow:inset 3px 0 0 var(--pdv-accent);background:color-mix(in srgb,var(--pdv-accent) 10%,var(--pdv-bg))}
.pdv-rtable tr.row.row-sel td.col-on{background:color-mix(in srgb,var(--pdv-accent) 18%,var(--pdv-bg))}
.pdv-rtable tr.fade td,.pdv-rtable th.fade{color:var(--pdv-fg3)}
.pdv-rtable tr.fade td>*,.pdv-rtable th.fade>*{opacity:.45}
.pdv-focus{display:inline-flex;align-items:center;gap:6px;padding:2px 4px 2px 10px;border-radius:999px;background:color-mix(in srgb,var(--pdv-accent) 12%,var(--pdv-bg));color:var(--pdv-fg);font-weight:600}
.pdv-x{border:0;background:none;width:20px;height:20px;border-radius:50%;padding:0;line-height:18px;color:var(--pdv-fg2)}
.pdv-x:hover{background:var(--pdv-hover)}
.pdv-matrix{border-collapse:separate;border-spacing:0;min-width:100%}
.pdv-matrix th{position:sticky;top:0;z-index:2;background:var(--pdv-th);text-align:left;padding:9px 10px;border-bottom:1px solid var(--pdv-strong);border-right:1px solid var(--pdv-line2);white-space:nowrap;vertical-align:bottom}
.pdv-matrix th .cap{display:block;font-size:13px;font-weight:700;color:var(--pdv-fg)}
.pdv-matrix th .cnt{font-size:11px;font-weight:400;color:var(--pdv-fg3)}
.pdv-matrix th.corner{left:0;z-index:4;font-size:11px;font-weight:500;color:var(--pdv-fg3);border-right:1px solid var(--pdv-strong)}
.pdv-matrix td{vertical-align:top;padding:8px;border-bottom:1px solid var(--pdv-line2);border-right:1px solid var(--pdv-line2);min-width:170px}
.pdv-matrix tbody tr:last-child td{border-bottom:0}
.pdv-matrix td.empty{background:repeating-linear-gradient(135deg,transparent 0 6px,var(--pdv-line2) 6px 7px)}
.pdv-matrix td.rowh{position:sticky;left:0;z-index:3;background:var(--pdv-surface);min-width:128px;border-right:1px solid var(--pdv-strong);padding:10px 12px}
.pdv-matrix td.rowh .obj{display:block;font-size:14px;font-weight:700;color:var(--pdv-fg)}
.pdv-matrix td.rowh small{display:block;color:var(--pdv-fg3);font-size:11px;margin-top:2px}
.pdv-matrix td.rowh .cnt{display:inline-block;margin-top:6px;font-size:11px;color:var(--pdv-fg2)}
.pdv-chip{display:block;border:1px solid color-mix(in srgb,var(--c) 35%,var(--pdv-line));border-left:4px solid var(--c);border-radius:8px;background:color-mix(in srgb,var(--c) 7%,var(--pdv-bg));padding:6px 8px;margin-bottom:6px;cursor:pointer;user-select:none;max-width:250px;box-shadow:var(--pdv-shadow)}
.pdv-chip:last-child{margin-bottom:0}
.pdv-chip{position:relative;padding-right:26px}
.pdv-chip .open{position:absolute;right:4px;top:4px;width:20px;height:20px;border-radius:5px;border:1px solid var(--pdv-line);background:var(--pdv-bg);color:var(--pdv-fg2);font-size:14px;line-height:16px;padding:0;opacity:0;transition:opacity .12s}
.pdv-chip:hover .open,.pdv-chip:focus-within .open{opacity:1}
.pdv-chip .open:hover{border-color:var(--pdv-fg);color:var(--pdv-fg)}
.pdv-chip .meta .st{font-size:11px;font-weight:600;color:var(--c)}
.pdv-chip:hover{background:color-mix(in srgb,var(--c) 14%,var(--pdv-bg))}
.pdv-chip.st-ok{background:var(--pdv-bg);border-color:var(--pdv-line);border-left-color:var(--c)}
.pdv-chip.st-ok .nm{color:var(--pdv-fg2);font-weight:500}
.pdv-chip .nm{display:block;font-weight:600;color:var(--pdv-fg);line-height:1.35}
.pdv-chip .nm .pdv-id{margin-right:5px}
.pdv-chip .meta{display:flex;gap:5px;align-items:center;margin-top:5px;flex-wrap:wrap}
.pdv-cnt{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;line-height:18px;padding:0 6px;border-radius:999px;color:var(--c);background:color-mix(in srgb,var(--c) 13%,var(--pdv-bg))}
.pdv-cnt.q{--c:var(--pdv-err);background:var(--pdv-bg);border:1px solid color-mix(in srgb,var(--c) 50%,transparent)}.pdv-cnt.a{--c:var(--pdv-fg2);background:var(--pdv-bg);border:1px solid var(--pdv-line)}.pdv-cnt.rv{--c:var(--pdv-warn);border:1px dashed var(--c)}.pdv-cnt.miss{--c:var(--pdv-err);border:1px dashed var(--c)}
.pdv-cnt.blk{--c:var(--pdv-err);background:var(--pdv-err);color:var(--pdv-bg)}
.pdv-mini{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--pdv-line);border-left:3px solid var(--k,var(--pdv-line));border-radius:5px;padding:0 6px;font-size:12px;line-height:20px;cursor:pointer;background:var(--pdv-bg);margin:0 4px 4px 0;max-width:100%}
.pdv-mini .pdv-id{color:var(--k,var(--pdv-fg3));font-weight:700}
.pdv-mini:hover{background:var(--pdv-hover)}
.pdv-mini.closed{opacity:.55}
.pdv-mini.closed .lbl{text-decoration:line-through}
/* ---------- 清单 ---------- */
.pdv-twrap{border:1px solid var(--pdv-line);border-radius:10px;overflow:clip}
.pdv-table{width:100%;border-collapse:collapse}
.pdv-table th{text-align:left;font-weight:700;font-size:12px;color:var(--pdv-fg2);padding:8px 10px;border-bottom:1px solid var(--pdv-strong);position:sticky;top:-14px;background:var(--pdv-th);z-index:1;white-space:nowrap}
.pdv-table td{padding:8px 10px;border-bottom:1px solid var(--pdv-line2);vertical-align:top}
.pdv-table tr.row{cursor:pointer}
.pdv-table tr.row:hover td{background:var(--pdv-hover)}
.pdv-table tr.row td.idc{border-left:3px solid var(--k,transparent);white-space:nowrap}
.pdv-table tr.row td.idc .pdv-id{color:var(--k);font-weight:700;font-size:12px}
.pdv-table tr.row .ttl{font-weight:600;color:var(--pdv-fg)}
.pdv-table tr.row.closed td{color:var(--pdv-fg3);background:color-mix(in srgb,var(--pdv-surface) 60%,var(--pdv-bg))}
.pdv-table tr.row.closed .ttl{text-decoration:line-through;color:var(--pdv-fg3);font-weight:500}
.pdv-table tr.grp td{background:var(--pdv-surface);font-weight:700;font-size:12.5px;cursor:pointer;color:var(--pdv-fg);padding:7px 10px;border-bottom:1px solid var(--pdv-line);border-top:1px solid var(--pdv-line)}
.pdv-table tr.grp td .n{margin-left:6px;font-weight:500;color:var(--pdv-fg3)}
.pdv-table tr.grp.done td{color:var(--pdv-ok)}
.pdv-flag{font-size:11px;color:var(--pdv-warn);white-space:nowrap;display:block;font-weight:600}
.pdv-flag.blk{color:var(--pdv-err)}
/* ---------- 卡片 ---------- */
.pdv-crumb{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.pdv-chead{border:1px solid var(--pdv-line);border-left:5px solid var(--c,var(--pdv-line));border-radius:10px;padding:12px 14px;margin-bottom:12px;background:var(--pdv-surface)}
.pdv-chead .t{font-size:18px;font-weight:700;margin:0 8px 0 4px}
.pdv-chead .meta{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--pdv-fg3);margin-top:6px}
.pdv-chead .meta b{color:var(--pdv-fg);font-weight:600}
.pdv-chead .lead{margin-top:6px;color:var(--pdv-fg2)}
.pdv-banner{margin-top:10px;border:1px solid color-mix(in srgb,var(--pdv-warn) 45%,transparent);border-left:4px solid var(--pdv-warn);padding:6px 10px;background:color-mix(in srgb,var(--pdv-warn) 9%,var(--pdv-bg));border-radius:6px;cursor:pointer}
.pdv-cgrid-wrap{position:relative;padding-bottom:6px;border:1px solid var(--pdv-line);border-radius:10px}
.pdv-cgrid{position:relative;display:grid;gap:0}
.pdv-cgrid .lh{position:sticky;left:0;z-index:3;font-size:12px;font-weight:700;color:var(--L);padding:10px;border-top:1px solid var(--pdv-line);border-right:1px solid var(--pdv-strong);border-left:4px solid var(--L);background:color-mix(in srgb,var(--L) 9%,var(--pdv-bg))}
.pdv-cgrid .lh.top{border-top:0;background:var(--pdv-surface);border-left-color:transparent}
.L-steps{--L:var(--pdv-accent)}.L-adj{--L:var(--pdv-warn)}.L-qs{--L:var(--pdv-err)}.L-compat{--L:var(--pdv-fg2)}.L-related{--L:var(--pdv-fg3)}
.pdv-cgrid .sh{padding:9px 10px;border-bottom:1px solid var(--pdv-strong);border-right:1px solid var(--pdv-line2);font-weight:700;position:sticky;top:0;background:var(--pdv-th);z-index:3;display:flex;gap:8px;align-items:flex-start}
.pdv-cgrid .sh small{display:block;font-weight:400;color:var(--pdv-fg3);font-size:11px}
.pdv-cgrid .sh .no{flex:none;width:20px;height:20px;border-radius:50%;background:var(--pdv-ink);color:var(--pdv-bg);font-size:11px;display:inline-flex;align-items:center;justify-content:center;margin-top:1px}
.pdv-cgrid .sh.pre .no{background:transparent;border:1.5px dashed var(--pdv-fg3);color:var(--pdv-fg3)}
.pdv-cgrid .cell{padding:10px 8px;border-top:1px solid var(--pdv-line);border-right:1px solid var(--pdv-line2);min-width:0;background:color-mix(in srgb,var(--pdv-accent) 3%,var(--pdv-bg))}
.pdv-cgrid .cell.pre{background:var(--pdv-bg)}
.pdv-layer{display:grid;grid-auto-flow:row dense;gap:6px;padding:8px 0;border-top:1px solid var(--pdv-line);background:color-mix(in srgb,var(--L) 4%,var(--pdv-bg))}
.pdv-node{border:1px solid var(--pdv-line);border-radius:8px;background:var(--pdv-bg);padding:7px 9px;margin-bottom:7px;cursor:pointer;position:relative;box-shadow:var(--pdv-shadow);border-left:4px solid var(--g,var(--pdv-ok))}
.pdv-node:hover{border-color:var(--pdv-strong);border-left-color:var(--g,var(--pdv-ok))}
.pdv-node .hd{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.pdv-node .hd b{font-weight:600;color:var(--pdv-fg)}
.pdv-node .d{color:var(--pdv-fg2);font-size:12px;margin-top:3px}
.pdv-node .rules{margin-top:6px;padding-top:6px;border-top:1px dashed var(--pdv-line)}
.pdv-node.pre{border-style:dashed;border-left:1px dashed var(--pdv-line);box-shadow:none;background:var(--pdv-surface)}
.pdv-node.pre .hd b{font-weight:500}
.tag-keep{--g:var(--pdv-ok)}.tag-adjust{--g:var(--pdv-warn)}.tag-gap,.tag-need{--g:var(--pdv-err)}
.pdv-tagp{font-size:10.5px;font-weight:700;border-radius:3px;padding:0 5px;color:var(--g);background:color-mix(in srgb,var(--g) 13%,var(--pdv-bg))}
.pdv-rule{display:inline-flex;align-items:center;gap:4px;border-radius:4px;padding:0 6px;font-size:11.5px;line-height:20px;margin:0 4px 4px 0;cursor:pointer;color:var(--pdv-violet);background:color-mix(in srgb,var(--pdv-violet) 10%,var(--pdv-bg));border:1px solid color-mix(in srgb,var(--pdv-violet) 30%,transparent)}
.pdv-rule .pdv-id{color:var(--pdv-violet);font-weight:700}
.pdv-span{border:1px solid color-mix(in srgb,var(--c,var(--pdv-line)) 40%,var(--pdv-line));border-left:4px solid var(--c,var(--pdv-line));border-radius:8px;background:var(--pdv-bg);padding:6px 9px;cursor:pointer;margin:0 6px;min-width:0;box-shadow:var(--pdv-shadow)}
.pdv-span:hover{background:color-mix(in srgb,var(--c,var(--pdv-fg3)) 8%,var(--pdv-bg))}
.pdv-span .ends{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--pdv-fg3);margin-top:3px}
.pdv-span.closed{opacity:.55}
.pdv-span.closed .tt{text-decoration:line-through}
.pdv-span .tt{font-weight:600}
.pdv-lines{position:absolute;left:0;top:0;pointer-events:none;z-index:1;overflow:visible}
.pdv-cgrid .sh.corner{left:0;z-index:4}
.pdv-lines path{fill:none;stroke:var(--pdv-accent);stroke-width:1.8;opacity:.85}
.pdv-lines circle{fill:var(--pdv-accent)}
.pdv-simple{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.pdv-box{border:1px solid var(--pdv-line);border-top:3px solid var(--c,var(--pdv-line));border-radius:8px;padding:10px 12px;background:var(--pdv-bg);margin-bottom:10px}
.pdv-box h4{margin:0 0 6px;font-size:12px;color:var(--c,var(--pdv-fg2));font-weight:700}
.pdv-box p{margin:0;white-space:pre-wrap}
/* ---------- 全貌 ---------- */
.pdv-sec{margin-bottom:20px;border:1px solid var(--pdv-line);border-radius:10px;padding:12px 14px}
.pdv-sec>h3{font-size:14px;margin:0 0 10px;color:var(--pdv-fg);font-weight:700;display:flex;align-items:center;gap:8px}
.pdv-sec>h3:before{content:"";width:4px;height:14px;border-radius:2px;background:var(--pdv-accent)}
.pdv-life{display:flex;align-items:stretch;overflow-x:auto;padding-bottom:6px}
.pdv-state{flex:none;min-width:180px;max-width:250px;border:1px solid var(--pdv-line);border-top:4px solid var(--c,var(--pdv-accent));border-radius:10px;padding:10px;background:var(--pdv-surface)}
.pdv-state h5{margin:0 0 2px;font-size:14px;font-weight:700}
.pdv-state small{display:block;color:var(--pdv-fg3);margin-bottom:8px}
.pdv-gap{flex:none;width:130px;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:0 6px;gap:4px}
.pdv-gap .arr{width:100%;border-top:2px solid var(--pdv-fg2);position:relative}
.pdv-gap .arr:after{content:"";position:absolute;right:-1px;top:-6px;border:5px solid transparent;border-left:8px solid var(--pdv-fg2)}
.pdv-gap .arr.back{border-top-style:dashed;border-top-color:var(--pdv-warn)}
.pdv-gap .arr.back:after{right:auto;left:-1px;border-left:5px solid transparent;border-right:8px solid var(--pdv-warn)}
.pdv-txt{font-size:12px;color:var(--pdv-fg2);margin-bottom:4px}
.pdv-chain{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px}
.pdv-chain>b{min-width:120px}
.pdv-chain .sep{color:var(--pdv-fg3)}
.pdv-map{width:100%;height:auto;border-radius:8px;background:var(--pdv-surface)}
.pdv-map .n rect{fill:var(--pdv-bg);stroke:var(--pdv-line);stroke-width:1.2}
.pdv-map .n.own rect{fill:color-mix(in srgb,var(--pdv-accent) 16%,var(--pdv-bg));stroke:var(--pdv-accent);stroke-width:2}
.pdv-map .n text{fill:var(--pdv-fg);font-size:13px;font-weight:600}
.pdv-map .n text.sub{fill:var(--pdv-fg3);font-size:11px;font-weight:400}
.pdv-map .n{cursor:pointer}
.pdv-map .e line{stroke:var(--pdv-fg3);stroke-width:1.2}
.pdv-map .e text{fill:var(--pdv-fg2);font-size:11px}
.pdv-map .need-change rect{stroke:var(--pdv-warn);stroke-width:2.2;fill:color-mix(in srgb,var(--pdv-warn) 9%,var(--pdv-bg))}
.pdv-map .need-new rect{stroke:var(--pdv-accent);stroke-width:2.2;fill:color-mix(in srgb,var(--pdv-accent) 9%,var(--pdv-bg))}
.pdv-map .need-confirm rect,.pdv-map .need-pending rect{stroke:var(--pdv-violet);stroke-dasharray:4 3;stroke-width:1.8}
.pdv-map g.dim{opacity:.22}
.pdv-map g.rel rect{stroke-width:3.2}
/* ---------- 抽屉 ---------- */
.pdv-dh{position:sticky;top:-14px;z-index:2;display:flex;align-items:flex-start;gap:6px;margin:-14px -16px 12px;padding:14px 16px 12px;border-bottom:1px solid var(--pdv-line);background:var(--pdv-bg);border-top:4px solid var(--k,var(--pdv-line))}
.pdv-dh .t{font-weight:700;font-size:15px;flex:1;line-height:1.4}
.pdv-dh .t .pdv-id{color:var(--k);font-size:13px;margin-right:4px}
.pdv-kv{margin:0 0 10px}
.pdv-kv dt{font-size:11.5px;color:var(--pdv-fg3);margin-top:12px;font-weight:600;letter-spacing:.02em}
.pdv-kv dd{margin:3px 0 0;white-space:pre-wrap;word-break:break-word}
.pdv-code{font-family:var(--dsw-font-mono,ui-monospace,Consolas,monospace);font-size:12px;color:var(--pdv-fg2);word-break:break-all;white-space:pre-wrap}
.pdv-actions{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.pdv-opbox{border:1px solid var(--pdv-line);border-radius:8px;padding:8px 10px;margin-bottom:6px;background:var(--pdv-surface)}
.pdv-opbox .pdv-actions{margin:8px 0 4px}
.pdv-review{border:1px solid var(--pdv-warn);border-radius:8px;padding:8px 10px;margin:8px 0;background:color-mix(in srgb,var(--pdv-warn) 9%,var(--pdv-bg))}
.pdv-hist{list-style:none;margin:0;padding:0;font-size:12px}
.pdv-hist li{border-left:2px solid var(--pdv-line);padding:0 0 8px 10px;color:var(--pdv-fg2)}
.pdv-hist li b{color:var(--pdv-fg);font-weight:600}
.pdv-toast{position:absolute;right:16px;bottom:16px;max-height:30vh;overflow:auto;z-index:20;background:var(--dsw-alias-toast-bg,#333);color:var(--dsw-alias-toast-label,#fff);border-radius:8px;padding:8px 12px;max-width:440px;box-shadow:0 4px 16px rgba(0,0,0,.15);font-size:12px;white-space:pre-wrap}
.pdv-toast.err{background:var(--pdv-err);color:#fff}
/* ---------- 设置页 ---------- */
.pdvs{color:var(--pdv-fg);font-size:13px;padding:4px 2px 24px;background:transparent;display:block;height:auto}
.pdvs h2{font-size:16px;margin:0 0 4px}
.pdvs h3{font-size:13px;margin:18px 0 8px}
.pdvs .desc{color:var(--pdv-fg2);margin:0 0 8px}
.pdvs .card{border:1px solid var(--dsw-alias-settings-card-stroke,var(--pdv-line));background:var(--dsw-alias-settings-card-fill,var(--pdv-surface));border-radius:10px;padding:10px 12px;margin-bottom:8px}
.pdvs .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pdvs .kv{display:grid;grid-template-columns:90px minmax(0,1fr);gap:2px 8px;font-size:12px;margin-top:6px}
.pdvs .kv span:nth-child(odd){color:var(--pdv-fg3)}
.pdvs .field{display:flex;flex-direction:column;gap:3px;margin-bottom:8px;font-size:12px;color:var(--pdv-fg2)}
.pdvs .field .pdv-input{width:100%}
.pdvs .opt{display:flex;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px solid var(--pdv-line2)}
.pdvs .opt:last-child{border-bottom:0}
.pdvs .opt .tx{flex:1}
.pdvs .opt .tx small{display:block;color:var(--pdv-fg3)}
.pdv-switch{width:34px;height:20px;border-radius:10px;border:0;background:var(--pdv-strong);position:relative;flex:none;padding:0}
.pdv-switch[aria-checked="true"]{background:var(--pdv-ink)}
.pdv-switch:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:left .15s}
.pdv-switch[aria-checked="true"]:after{left:16px}
.pdvs .msg{font-size:12px;margin-top:6px;color:var(--pdv-fg2)}
.pdvs .msg.err{color:var(--pdv-err)}
`
    function Style() { return h('style', null, CSS) }

    // ------------------------------------------------------------ 工具
    const fmt = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : ''))
    const cx = (...xs) => xs.filter(Boolean).join(' ')
    const arr = v => (Array.isArray(v) ? v : [])
    const oid = o => (o && typeof o === 'object' ? o.id : o)
    const oname = o => (o && typeof o === 'object' ? (o.name ?? o.id) : o)
    const osub = o => (o && typeof o === 'object' ? o.sub : undefined)
    const shortDate = iso => (iso ? String(iso).slice(5, 10) : '')
    const CLOSED = { issue: ['resolved', 'wontfix', 'superseded'], adjustment: ['done', 'verified', 'dropped', 'superseded'] }

    function makeApi(rpc) {
      return async function call(endpoint, payload) {
        const result = await rpc.call('/api', 'prd-view.' + endpoint, payload ?? {})
        if (!result || !result.ok) throw new Error(result?.error?.message ?? 'request failed')
        return result.value
      }
    }

    /** 统一索引：编号 → { kind, item }，以及关联图。 */
    function buildIndex(payload) {
      if (!payload) return null
      const { data, derived } = payload
      const byId = new Map()
      const add = (kind, list) => { for (const it of arr(list)) byId.set(it.id, { kind, item: it }) }
      add('feature', data.features); add('issue', data.issues); add('adjustment', data.adjustments)
      add('rule', data.rules); add('module', data.modules); add('object', data.objects)
      const rel = new Map()
      const link = (a, b) => {
        if (!a || !b || a === b) return
        if (!rel.has(a)) rel.set(a, new Set()); if (!rel.has(b)) rel.set(b, new Set())
        rel.get(a).add(b); rel.get(b).add(a)
      }
      for (const q of arr(data.issues)) for (const f of arr(q.features)) link(q.id, f)
      for (const a of arr(data.adjustments)) { for (const f of arr(a.features)) link(a.id, f); for (const q of arr(a.blocked)) link(a.id, q) }
      for (const m of arr(data.modules)) { for (const f of arr(m.features)) link(m.id, f); for (const x of arr(m.adj)) link(m.id, x); for (const x of arr(m.q)) link(m.id, x) }
      for (const g of arr(data.rules)) { for (const f of Object.keys(g.uses ?? {})) link(g.id, f); for (const x of arr(g.adj)) link(g.id, x); for (const x of arr(g.q)) link(g.id, x) }
      for (const o of arr(data.objects)) for (const f of arr(o.features)) link(o.id, f)
      for (const f of arr(data.features)) for (const r of arr(f.rel)) link(f.id, r)
      for (const [s, t] of arr(data.objMap?.edges).map(e => [e[0], e[1]])) link(s, t)
      const closed = id => { const e = byId.get(id); return Boolean(e && CLOSED[e.kind] && CLOSED[e.kind].includes(e.item.progress)) }
      return { data, derived, byId, rel, closed }
    }

    function relatedOf(index, id) {
      const out = new Set()
      if (!index || !id) return out
      for (const x of index.rel.get(id) ?? []) out.add(x)
      return out
    }

    function useT(t) { return useCallback((k, vars) => fmt(t ? t(k) : (zh[k] ?? k), vars), [t]) }

    function Toast({ toast }) {
      if (!toast) return null
      return h('div', { className: cx('pdv-toast', toast.err && 'err'), role: toast.err ? 'alert' : 'status' }, toast.text)
    }

    // ------------------------------------------------------------ 对话绑定（头部选择器与页签共享）
    function createBindingStore(api) {
      const cells = new Map()
      const cell = sid => {
        let c = cells.get(sid)
        if (!c) { c = { value: undefined, error: null, listeners: new Set(), seq: 0, timer: undefined, form: {}, task: null, taskBusy: false, taskSeq: 0, draftResult: null, cwd: undefined }; cells.set(sid, c) }
        return c
      }
      const publish = c => { for (const l of [...c.listeners]) l() }
      const settle = (sid, value) => { const c = cell(sid); c.seq++; c.value = value; c.error = null; publish(c); return value }
      async function refresh(sid) {
        const c = cell(sid)
        const seq = ++c.seq
        try {
          const v = await api('binding', { sessionId: sid, cwd: c.cwd })
          if (seq === c.seq) { c.value = v; c.error = null; publish(c) }
        } catch (e) {
          if (seq === c.seq) { c.error = e.message; publish(c) }
        }
      }
      let disposed = false
      async function refreshTask(sid) {
        const c = cell(sid)
        if (c.taskBusy || disposed || c.hideTasks) return
        c.taskBusy = true
        const seq = c.taskSeq
        try {
          const tasks = await api('creationTasks', { sessionId: sid })
          if (disposed || seq !== c.taskSeq) return
          const task = [...tasks].filter(task => !task.supersededBy).sort((a,b) => {
            const running = task => ['queued','running','waiting-session'].includes(task.status) ? 1 : 0
            return running(b) - running(a) || String(b.updatedAt).localeCompare(String(a.updatedAt))
          })[0]
          c.taskError = null
          if (task) {
            const newlyCompleted = task.status === 'completed' && (c.task?.id !== task.id || c.task?.status !== 'completed')
            c.task = task
            if (!Object.keys(c.form).length && task.form) c.form = { ...task.form }
            if (newlyCompleted) void refresh(sid)
          }
          publish(c)
        } catch (e) { if (!disposed) { c.taskError = e.message; publish(c) } }
        finally { c.taskBusy = false }
      }
      return {
        get: sid => cell(sid),
        setCwd(sid, cwd) { cell(sid).cwd = cwd },
        resetCreation(sid) { const c = cell(sid); c.taskSeq++; c.task = null; c.form = { mode: 'new' }; c.draftResult = null; c.intentSignature = undefined; c.requestId = undefined; c.hideTasks = true; publish(c) },
        patchForm(sid, patch) { Object.assign(cell(sid).form, patch); publish(cell(sid)) },
        setDraftResult(sid, result) { const c = cell(sid); c.draftResult = result; c.draftTaskId = c.task?.id; publish(c) },
        notice(sid, project) { const c = cell(sid); c.notices ??= new Map(); if (!c.notices.has(project)) c.notices.set(project, {}); return c.notices.get(project) },
        patchNotice(sid, project, patch) { Object.assign(this.notice(sid, project), patch); publish(cell(sid)) },
        dispose() { disposed = true; for (const c of cells.values()) { clearInterval(c.timer); c.seq++; c.listeners.clear() } },
        async retry(sid) { const c = cell(sid); c.taskSeq++; c.task = await api('retryCreation', { id: c.task.id }); publish(c) },
        refresh,
        subscribe(sid, listener) {
          const c = cell(sid)
          c.listeners.add(listener)
          if (c.listeners.size === 1) { void refresh(sid); void refreshTask(sid); c.timer = setInterval(() => { void refresh(sid); void refreshTask(sid) }, 3000) }
          return () => {
            c.listeners.delete(listener)
            if (!c.listeners.size && c.timer) { clearInterval(c.timer); c.timer = undefined }
          }
        },
        async bind(sid, project) { return settle(sid, await api('bind', { sessionId: sid, cwd: cell(sid).cwd, project: project || null })) },
        async create(sid, form) {
          const c = cell(sid)
          // Keep one intent id through transport failures; changed forms get a new intent.
          const signature = JSON.stringify(form)
          if (c.intentSignature !== signature || (!c.task?.created && ['failed','interrupted'].includes(c.task?.status))) {
            c.intentSignature = signature; c.requestId = globalThis.crypto.randomUUID()
          }
          c.taskSeq++; c.hideTasks = false
          c.task = await api('createTask', { sessionId: sid, cwd: c.cwd, requestId: c.requestId, ...form })
          c.draftResult = null; publish(c); return c.task
        },
      }
    }

    function useBinding(store, sid) {
      const [, force] = useState(0)
      useEffect(() => (store && sid ? store.subscribe(sid, () => force(n => n + 1)) : undefined), [store, sid])
      const c = store && sid ? store.get(sid) : null
      return { value: c?.value, error: c?.error ?? null }
    }

    const scopeLabel = (t, p) => (p.scope === 'project' ? t('bind.scopeProject') : t('bind.scopeRegistered'))

    /** 头部右侧：本对话绑定的研发视图。 */
    function BindingPicker(props) {
      const t = useT(props.t)
      const { value, error } = useBinding(props.store, props.sessionId)
      const [busy, setBusy] = useState(false)
      const [fail, setFail] = useState(null)
      if (!value) return error ? h('span', { className: 'pdv-pick err', title: error }, h(PickStyle), t('bind.label'), ' ⚠') : null
      const cur = value.project?.id ?? ''
      const local = value.candidates.filter(p => p.scope === 'project')
      const others = value.candidates.filter(p => p.scope !== 'project')
      const opt = p => h('option', { key: p.id, value: p.id }, p.title)
      const tip = value.project
        ? `${t('bind.tipBound', { title: value.project.title })}\n${value.project.relPath ?? value.project.dataFile}${value.source === 'default' ? '\n' + t('bind.tipDefault') : ''}`
        : t('bind.tipNone')
      return h('label', { className: cx('pdv-pick', !cur && 'none', fail && 'err'), title: fail ?? tip },
        h(PickStyle),
        h('span', { className: 'lbl' }, t('bind.label')),
        props.store.get(props.sessionId).task ? h('span', { role: 'status', title: t('create.working') },
          t('create.' + (props.store.get(props.sessionId).task.status === 'failed' ? 'failedStatus' : props.store.get(props.sessionId).task.status)),
          Number.isFinite(props.store.get(props.sessionId).task.progress?.total) ? ' ' + (props.store.get(props.sessionId).task.progress.completed ?? 0) + '/' + props.store.get(props.sessionId).task.progress.total : '') : null,
        h('select', {
          value: value.source === 'missing' ? '__missing' : cur, disabled: busy, 'aria-label': t('bind.aria'),
          onChange: async (e) => {
            setBusy(true); setFail(null)
            try { await props.store.bind(props.sessionId, e.target.value) } catch (err) { setFail(err.message) } finally { setBusy(false) }
          },
        },
        h('option', { value: '' }, t('bind.none')),
        value.source === 'missing' ? h('option', { value: '__missing', disabled: true }, t('bind.missing')) : null,
        local.length ? h('optgroup', { label: t('bind.groupProject') }, local.map(opt)) : null,
        others.length ? h('optgroup', { label: t('bind.groupRegistered') }, others.map(opt)) : null))
    }

    const PICK_CSS = `
.pdv-pick{display:inline-flex;align-items:center;gap:4px;height:26px;min-width:0;flex:0 1 auto;padding:0 2px 0 8px;margin-right:4px;border:1px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-radius:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#555);background:var(--dsw-alias-bg-base,#fff);max-width:260px;cursor:pointer}
.pdv-pick:hover{border-color:var(--dsw-alias-border-l4,rgba(0,0,0,.2))}
.pdv-pick .lbl{flex:none;color:var(--dsw-alias-label-tertiary,#888)}
@media (max-width:900px){.pdv-pick .lbl{display:none}}
.pdv-pick select{font:inherit;font-weight:600;color:var(--dsw-alias-label-primary,#111);background:transparent;border:0;outline:none;min-width:0;max-width:190px;text-overflow:ellipsis;cursor:pointer;padding:2px 2px}
.pdv-pick.none select{color:var(--dsw-alias-label-tertiary,#888);font-weight:500}
.pdv-pick.err{border-color:var(--dsw-alias-state-error-primary,#dc2626)}
.pdv-pick:focus-within{border-color:var(--dsw-alias-state-business-primary,#3b6cf6)}
`
    function PickStyle() { return h('style', null, PICK_CSS) }

    const fmtSize = n => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')

    /**
     * PRD 文档路径输入：填写或粘贴 .md 的完整路径，停顿后自动检查，显示图片、缺失与编码情况。
     * onResult(info|null) 在检查结果变化时回调；只有检查通过的路径才算有效。
     */
    function PrdPathField({ t, api, value, onChange, onResult, disabled, autoFocus }) {
      const [state, setState] = useState({ status: 'idle' })
      const seq = useRef(0)
      useEffect(() => {
        const p = value.trim()
        const my = ++seq.current
        if (!p) { setState({ status: 'idle' }); onResult?.(null); return undefined }
        setState({ status: 'checking' }); onResult?.(null)
        const timer = setTimeout(async () => {
          try {
            const info = await api('inspectPrd', { path: p })
            if (my !== seq.current) return
            setState({ status: 'ok', info }); onResult?.(info)
          } catch (e) {
            if (my !== seq.current) return
            setState({ status: 'error', error: e.message }); onResult?.(null)
          }
        }, 400)
        return () => clearTimeout(timer)
      }, [value])
      const info = state.info
      return h('div', { className: 'prd-path' },
        h('input', { className: 'pdv-input', value, disabled, autoFocus, spellCheck: false, placeholder: t('prd.pathPh'), 'aria-label': t('prd.label'), onChange: e => onChange(e.target.value) }),
        state.status === 'idle' ? h('div', { className: 'pdv-hint' }, t('prd.pathHint')) : null,
        state.status === 'checking' ? h('div', { className: 'pdv-hint' }, t('prd.checking')) : null,
        state.status === 'error' ? h('div', { className: 'prd-res err', role: 'alert' }, state.error) : null,
        state.status === 'ok' ? h('div', { className: 'prd-res ok' },
          h('div', null, '📄 ', h('b', null, info.name), h('small', null, ` · ${fmtSize(info.bytes)}`, info.encoding === 'gbk' ? ' · ' + t('prd.gbk') : '')),
          h('div', null, info.images ? t('prd.imagesCopy', { n: info.images, size: fmtSize(info.imageBytes) }) : t('prd.noImages'),
            info.remote ? ' · ' + t('prd.remote', { n: info.remote }) : ''),
          info.missing.length ? h('details', { className: 'miss' },
            h('summary', null, t('prd.missingN', { n: info.missing.length })),
            h('ul', null, info.missing.slice(0, 20).map((m, i) => h('li', { key: i }, t('prd.line', { n: m.line }), ' ', h('code', null, m.url),
              m.count > 1 ? ' ' + t('prd.times', { n: m.count }) : '', m.reason ? ` (${m.reason})` : ''))),
            info.missing.length > 20 ? h('div', { className: 'pdv-hint' }, t('prd.more', { n: info.missing.length - 20 })) : null) : null,
          info.notImage?.length ? h('details', { className: 'miss other' },
            h('summary', null, t('prd.notImageN', { n: info.notImage.length })),
            h('ul', null, info.notImage.slice(0, 20).map((m, i) => h('li', { key: i }, t('prd.line', { n: m.line }), ' ', h('code', null, m.url))))) : null) : null)
    }

    /** 页签：本对话未绑定时，绑定已有视图或新建一份。 */
    function CreationProgress({ t, task }) {
      if (!task) return null
      const p = task.progress ?? {}
      return h('section', { role: 'status', 'aria-live': 'polite' },
        h('b', null, t('create.status') + ': ' + t('create.' + (task.status === 'failed' ? 'failedStatus' : task.status))),
        h('p', null, t('create.stage') + ': ' + t('create.' + task.stage)),
        Number.isFinite(p.total) ? h('p', null, t('create.files', { done: p.completed ?? 0, total: p.total })) : null,
        Number.isFinite(p.bytesTotal) ? h('p', null, t('create.bytes', { done: p.bytesCompleted ?? 0, total: p.bytesTotal })) : null,
        p.currentFile ? h('small', null, p.currentFile) : null,
        task.error ? h('p', { role: 'alert' }, typeof task.error === 'string' ? task.error : task.error.message ?? JSON.stringify(task.error)) : null,
        h('small', null, t('create.working')))
    }

    // UI preferences live only in the session store, never in PRD data or history.
    // A changed phase/run/error reopens a dismissed notice; routine progress does not.
    function GenerationNotices({ t, api, project, store, sessionId, insertDraft }) {
      useBinding(store, sessionId)
      const c = store.get(sessionId)
      const task = c.task?.status === 'completed' && (!project || c.task.created?.id === project) ? c.task : null
      const target = project || task?.created?.id
      const scope = target || '__unbound'
      const notice = store.notice(sessionId, scope)
      const [receipt, setReceipt] = useState(null)
      const current = receipt?.scope === scope && receipt?.sessionId === sessionId && receipt?.taskId === task?.id ? receipt : null
      const state = notice.state
      const error = notice.error ?? null
      const reported = state && state.phase !== 'pending'
      const text = task?.created ? t('bind.draft', { title: task.created.title, prd: task.created.prdFile ?? task.form?.prdPath ?? '' }) : ''
      const draftResult = c.draftTaskId === task?.id ? c.draftResult : null
      const pendingDraft = task && text && !reported && (!target || current?.state?.phase === 'pending') && !error
      const signature = JSON.stringify([task?.id, state?.startedAt, state?.phase, state?.error, error])
      const hidden = notice.hidden === signature
      const expanded = !hidden && notice.expanded === signature
      useEffect(() => {
        let active = true, timer
        const poll = async () => {
          const shared = store.notice(sessionId, scope)
          const seq = shared.pollSeq = (shared.pollSeq ?? 0) + 1
          const accept = () => active && seq >= (shared.acceptedSeq ?? 0)
          try {
            const next = await api('getGeneration', { project: target })
            if (accept()) {
              setReceipt({ scope, sessionId, taskId: task?.id, state: next })
              store.patchNotice(sessionId, scope, { state: next, error: null, acceptedSeq: seq })
            }
          } catch(e) {
            if (accept()) {
              setReceipt({ scope, sessionId, taskId: task?.id })
              store.patchNotice(sessionId, scope, { error: e.message, acceptedSeq: seq })
            }
          }
          if (active) timer = setTimeout(poll, 4000)
        }
        if (target) void poll()
        return () => { active = false; clearTimeout(timer) }
      }, [api, target, scope, sessionId, task?.id, store])
      useEffect(() => {
        // Clear earlier dismissal on transitions, including a return to the same phase.
        if (notice.signature !== signature) store.patchNotice(sessionId, scope, { signature, hidden: null, expanded: null })
      }, [store, sessionId, scope, signature])
      useEffect(() => {
        // Wait for this view's receipt before touching a draft. A completed creation
        // task may be old; a reported generation must never prefill it again.
        if (!pendingDraft || draftResult) return
        store.setDraftResult(sessionId, insertDraft?.(text, false) ?? 'blocked')
      }, [pendingDraft, draftResult, text, insertDraft, sessionId, store])
      // Keep polling/subscriptions alive, but dismissed notices render no layout box.
      if ((!project && !task) || hidden) return null
      const summary = error ? t('generation.unavailable') : state ? t('generation.' + state.phase) : t(project ? 'loading' : 'generation.pending')
      const warning = Boolean(error || state?.error || ['failed', 'interrupted'].includes(state?.phase))
      return h('section', { className: 'pdv-notices', 'aria-label': t('generation.label') },
        h('div', { className: 'pdv-notice-row', 'data-warning': warning },
          h(Fragment, null,
            h('span', { className: 'pdv-notice-summary', role: 'status', title: summary }, summary,
              state && state.phase !== 'pending' ? ' · ' + t('notice.reported') : '',
              Number.isFinite(state?.total) ? ' · ' + (state.done ?? 0) + ' / ' + state.total : ''),
            h('button', { type: 'button', className: 'pdv-btn ghost', 'aria-expanded': expanded, onClick: () => store.patchNotice(sessionId, scope, { expanded: expanded ? null : signature }) }, t(expanded ? 'notice.collapse' : 'notice.expand')),
            h('button', { type: 'button', className: 'pdv-btn ghost', 'aria-label': t('notice.close'), title: t('notice.close'), onClick: () => store.patchNotice(sessionId, scope, { hidden: signature, expanded: null }) }, '×'))),
        expanded ? h('div', { className: 'pdv-notice-details' },
          h('b', null, t('generation.label')),
          error ? h('p', { role: 'alert' }, error) : null,
          state?.error ? h('p', { role: 'alert' }, typeof state.error === 'string' ? state.error : state.error.message ?? JSON.stringify(state.error)) : null,
          state?.phase === 'pending' || (!target && task) ? h('p', null, t('notice.pending')) : state?.detail ? h('p', null, state.detail) : null,
          state?.updatedAt ? h('small', null, t('generation.updated') + ' ' + new Date(state.updatedAt).toLocaleString()) : null,
          pendingDraft ? h('div', { className: 'pdv-draft-notice' },
            h('p', null, t(draftResult === 'applied' ? 'create.draftReady' : 'create.draftKept')),
            draftResult !== 'applied' ? h('button', { type: 'button', className: 'pdv-btn', onClick: () => store.setDraftResult(sessionId, insertDraft?.(text, true) ?? 'blocked') }, t('create.insert')) : null) : null) : null)
    }

    function UnboundPanel({ t, api, binding, store, sessionId, insertDraft }) {
      useBinding(store, sessionId)
      const c = store.get(sessionId), form = c.form
      const title = form.title ?? '', prdPath = form.prdPath ?? '', location = form.location ?? binding.viewsRel ?? ''
      const branch = form.branch ?? '', prd = form.prd ?? null
      const patch = value => store.patchForm(sessionId, value)
      const [submitting, setSubmitting] = useState(false), [fail, setFail] = useState(null)
      const task = c.task
      const busy = submitting || ['queued','running','waiting-session'].includes(task?.status)
      const run = async fn => { setSubmitting(true); setFail(null); try { await fn() } catch(e) { setFail(e.message) } finally { setSubmitting(false) } }
      const onResult = useCallback(info => {
        const current = store.get(sessionId).form
        store.patchForm(sessionId, { prd: info, ...(!current.titleTouched && info ? { title: info.name.replace(/\.(md|markdown)$/i, '') } : {}) })
      }, [store, sessionId])
      const create = () => run(() => store.create(sessionId, { title: title.trim(), branch: branch.trim(), location: location.trim() || undefined, prdPath: prdPath.trim() }))
      const where = binding.root, absLoc = /^([a-zA-Z]:[\\/]|[\\/])/.test(location.trim())
      const canCreate = Boolean(title.trim() && prd && (where || absLoc))
      const mode = form.mode ?? (binding.candidates?.length ? 'existing' : 'new')
      const existing = mode === 'existing'
      return h('div', { className: 'pdv-unbound' },
        h('h3', null, t('tab')),
        h('div', { className: 'pdv-mode', role: 'group' }, ['new','existing'].map(mode => h('button', { key: mode, className: 'pdv-btn', 'aria-pressed': (form.mode ?? (binding.candidates?.length ? 'existing' : 'new')) === mode, onClick: () => patch({ mode }) }, t('create.' + mode)))),
        task?.status === 'completed' ? h('button', { className: 'pdv-btn', title: t('create.resetNote'), onClick: () => store.resetCreation(sessionId) }, t('create.another')) : null,
        h('div', { className: 'pdv-create-scroll' },
        existing ? h('section', null, h('h4', null, t('bind.pickTitle')),
          !(binding.candidates ?? []).length ? h('p', null, t('create.empty')) : null,
          (binding.candidates ?? []).map(p => h('div', { key: p.id, className: 'opt' }, h('div', { className: 'tx' }, h('b', null, p.title), h('small', null, p.relPath ?? p.dataFile)),
            h('button', { className: 'pdv-btn', disabled: busy, onClick: () => run(() => store.bind(sessionId, p.id)) }, t('bind.pick'))))) : h('section', null,
          h('h4', null, t('bind.createTitle')),
          h('div', { className: 'field' }, h('span', null, t('prd.label')), h(PrdPathField, { t, api, value: prdPath, onChange: value => patch({ prdPath: value, prd: null }), onResult, disabled: busy })),
          h('label', { className: 'field' }, t('bind.nameLabel'), h('input', { className: 'pdv-input', value: title, disabled: busy, onChange: e => patch({ title: e.target.value, titleTouched: Boolean(e.target.value.trim()) }) })),
          h('label', { className: 'field' }, t('bind.locLabel'), h('div', { className: 'loc' }, h('input', { className: 'pdv-input', value: location, disabled: busy, onChange: e => patch({ location: e.target.value }) }),
            location !== (binding.viewsRel ?? '') ? h('button', { className: 'pdv-btn', disabled: busy, onClick: () => patch({ location: binding.viewsRel ?? '' }) }, t('bind.locReset')) : null)),
          h('p', { className: 'where' }, where ? t('bind.locNote', { root: where }) : t('bind.noCwd'),
            h('br'), t('bind.locPreview'), ' ', h('code', null, (location.trim() || binding.viewsRel || '') + '/' + (title.trim().replace(/[\\/:*?"<>|]/g, '') || t('bind.nameLabel')) + '/')),
          h('label', { className: 'field' }, t('create.branch'), h('input', { className: 'pdv-input', value: branch, disabled: busy, onChange: e => patch({ branch: e.target.value }) })),
          h('p', { className: 'pdv-hint' }, t('bind.createNote'))),
        fail ? h('div', { role: 'alert' }, fail) : null),
        h('footer', { className: 'pdv-create-footer' },
        h(CreationProgress, { t, task }),
        c.taskError ? h('p', { role: 'alert' }, c.taskError) : null,
        h(GenerationNotices, { t, api, project: binding.project?.id, store, sessionId, insertDraft }),
        task?.created && ['failed','interrupted','waiting-session'].includes(task.status) && task.stage === 'bind'
          ? h('button', { className: 'pdv-btn', disabled: submitting, onClick: () => run(async () => { await store.bind(sessionId, task.created.id); await store.retry(sessionId) }) }, t('create.retryBind')) : null,
          !existing ? h('button', { className: 'pdv-btn pri', disabled: busy || !canCreate || Boolean(task?.created), onClick: create }, busy ? t('bind.creating') : t('bind.create')) : null))
    }

    /** 总览：PRD 文档栏（当前文档、从原文件更新、更换）。 */
    function PrdBar({ ctx, data }) {
      const { t } = ctx
      const meta = data.meta.prd
      const src = ctx.prdSource
      const [open, setOpen] = useState(false)
      const [p, setP] = useState('')
      const [ok, setOk] = useState(null)
      const busy = ctx.prdBusy
      const submit = async () => { if (await ctx.changePrd(p.trim())) { setOpen(false); setP(''); setOk(null) } }
      return h('div', { className: 'pdv-prdbar' },
        h('div', { className: 'row' },
          meta
            ? h('span', { className: cx('prd', ctx.prdMissing && 'none'), title: ctx.prdFile ?? '' }, t('prd.current'), h('b', null, '📄 ' + meta.file),
              h('small', { className: 'pdv-hint' },
                meta.images ? ' · ' + t('prd.imagesN', { n: meta.images }) : '',
                meta.missing ? ' · ' + t('prd.missingShort', { n: meta.missing }) : '',
                ' · ' + shortDate(meta.updatedAt)),
              ctx.prdMissing ? h('small', null, t('prd.fileGone')) : null)
            : h('span', { className: 'prd none' }, t('prd.missing')),
          meta && src ? h('button', {
            className: 'pdv-btn', disabled: busy || !src.exists, onClick: () => { void ctx.changePrd(null) },
            title: src.exists ? t('prd.refreshTip', { path: src.path }) : t('prd.sourceGone', { path: src.path }),
          }, busy ? t('prd.updating') : t('prd.refresh')) : null,
          h('button', { className: 'pdv-btn', disabled: busy, 'aria-expanded': open ? 'true' : 'false', onClick: () => setOpen(!open) }, meta ? t('prd.replace') : t('prd.attach'))),
        meta && src ? h('div', { className: cx('src', !src.exists && 'gone') }, src.exists ? t('prd.sourceAt', { path: src.path }) : t('prd.sourceGone', { path: src.path })) : null,
        meta && !src ? h('div', { className: 'src' }, t('prd.sourceUnknown')) : null,
        open ? h('div', { className: 'pdv-prdform' },
          h(PrdPathField, { t, api: ctx.api, value: p, onChange: setP, onResult: setOk, disabled: busy, autoFocus: true }),
          h('div', { className: 'row' },
            h('button', { className: 'pdv-btn pri', disabled: busy || !ok, onClick: () => { void submit() } }, busy ? t('prd.updating') : (meta ? t('prd.doReplace') : t('prd.doAttach'))),
            h('button', { className: 'pdv-btn', disabled: busy, onClick: () => { setOpen(false); setP('') } }, t('set.cancel')),
            meta ? h('span', { className: 'pdv-hint' }, t('prd.replaceNote')) : null)) : null)
    }

    // ------------------------------------------------------------ 页签根组件
    function PrdTab(props) {
      const t = useT(props.t)
      const api = props.api
      // 本对话绑定的研发视图（页签右上角选择；与头部选择器共享同一份状态）
      const { value: binding, error: bindError } = useBinding(props.store, props.sessionId)
      const projectId = binding?.project?.id ?? ''
      const [payload, setPayload] = useState(null)
      const [error, setError] = useState(null)
      const [view, setView] = useState('summary')
      const rootRef = useRef(null)
      // 页签高度贴合可视区：主区和详情栏各自滚动，页面本身不出现滚动条
      useLayoutEffect(() => {
        const el = rootRef.current
        if (!el) return undefined
        const fit = () => { el.style.height = Math.max(360, window.innerHeight - el.getBoundingClientRect().top) + 'px' }
        fit()
        const timers = [setTimeout(fit, 200), setTimeout(fit, 1000)]
        window.addEventListener('resize', fit)
        return () => { window.removeEventListener('resize', fit); timers.forEach(clearTimeout) }
      }, [Boolean(projectId), Boolean(error && !payload)])
      const [sel, setSel] = useState(null) // { id } 或 { local: node, fid }
      const [card, setCard] = useState(null) // 功能编号
      const [searches, setSearches] = useState({})
      const search = !card && ['features', 'list', 'rules'].includes(view) ? (searches[view] ?? '') : ''
      const setSearch = value => { setSearches(prev => ({ ...prev, [view]: value })); setSel(null) }
      const [code, setCode] = useState(null)
      const [toast, setToast] = useState(null)
      const [recent, setRecent] = useState(() => new Set())
      const [preset, setPreset] = useState({ kpi: 'none', n: 0 })
      const openList = useCallback((kpi) => { if (kpi !== 'none') setSearches(prev => ({ ...prev, list: '' })); setCard(null); setSel(null); setView('list'); setPreset(p => ({ kpi, n: p.n + 1 })) }, [])
      const revRef = useRef(-1)
      const toastTimer = useRef(null)

      const notify = useCallback((text, err) => {
        setToast({ text, err }); clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(null), err ? 6000 : 3200)
      }, [])

      const loadProjects = useCallback(() => props.store.refresh(props.sessionId), [props.store, props.sessionId])

      const loadData = useCallback(async (pid, quiet) => {
        if (!pid) return
        try {
          const r = await api('load', { project: pid })
          const prev = revRef.current
          revRef.current = r.data.revision
          setPayload(old => {
            if (old && prev >= 0 && r.data.revision !== prev) {
              // 计算本次变化的条目，短暂高亮
              const changed = new Set()
              const before = new Map([...arr(old.data.issues), ...arr(old.data.adjustments), ...arr(old.data.features)].map(x => [x.id, JSON.stringify(x)]))
              for (const x of [...arr(r.data.issues), ...arr(r.data.adjustments), ...arr(r.data.features)]) if (before.get(x.id) !== JSON.stringify(x)) changed.add(x.id)
              setRecent(changed)
              setTimeout(() => setRecent(new Set()), 2500)
            }
            return r
          })
          setError(null)
        } catch (e) { if (!quiet) setError(e.message) }
      }, [api])

      const loadCode = useCallback(async (pid) => {
        if (!pid) return
        try { setCode(await api('codeStatus', { project: pid })) } catch (e) { setCode({ error: e.message }) }
      }, [api])

      useEffect(() => {
        revRef.current = -1; setPayload(null); setSel(null); setCard(null); setError(null)
        if (!projectId) return
        void loadData(projectId); void loadCode(projectId)
      }, [projectId, loadData, loadCode])

      // 轮询修订号：模型或其他页面修改后自动刷新
      useEffect(() => {
        if (!projectId) return undefined
        let alive = true
        const tick = async () => {
          try {
            const s = await api('status', { project: projectId })
            if (alive && s.revision !== revRef.current) await loadData(projectId, true)
          } catch { /* 下次再试 */ }
        }
        const a = setInterval(tick, 3000)
        const b = setInterval(() => { void loadCode(projectId) }, 30000)
        return () => { alive = false; clearInterval(a); clearInterval(b) }
      }, [projectId, api, loadData, loadCode])

      const index = useMemo(() => buildIndex(payload), [payload])

      // 会话里其他位置请求定位到某个条目
      useEffect(() => {
        const req = props.viewRequest
        if (!req || req.view !== VIEW_ID || !index) return
        const id = String(req.focus || '')
        if (index.byId.has(id)) {
          setSel({ id })
          const e = index.byId.get(id)
          if (e.kind === 'issue' || e.kind === 'adjustment') { setCard(null); setView('list') }
        }
        props.completeViewRequest?.()
      }, [props.viewRequest, index])

      const apply = useCallback(async (ops, reason) => {
        const r = await api('apply', { project: projectId, ops, reason, expectRevision: payload?.data?.revision })
        notify(`${t('drawer.saved')}：${r.changes.join('；')}${r.cascades.length ? '\n' + r.cascades.slice(0, 4).join('；') : ''}`)
        await loadData(projectId, true)
        return r
      }, [api, projectId, payload, loadData, notify, t])

      const doSync = async () => {
        try {
          const r = await api('sync', { project: projectId })
          notify(r.note ? t('toast.baselineSet') : t('toast.synced', { files: r.files, n: r.newlyMarked }))
          await loadData(projectId, true); await loadCode(projectId)
        } catch (e) { notify(e.message, true) }
      }
      const [prdBusy, setPrdBusy] = useState(false)
      /** 关联/更换（给路径）或从原文件更新（path 为 null）。成功返回 true。 */
      const changePrd = async (newPath) => {
        const cur = payload?.data?.meta?.prd
        if (newPath && cur && !window.confirm(t('prd.confirmReplace', { name: newPath.split(/[\\/]/).pop() }))) return false
        setPrdBusy(true)
        try {
          const r = await api('setPrd', { project: projectId, path: newPath || undefined })
          const p = r.prd
          if (r.unchanged) notify(t('prd.unchanged'))
          else {
            const parts = [t('prd.done.' + r.verb, { file: r.prdFile })]
            if (p.images) parts.push(t('prd.imagesCopied', { n: p.images }))
            if (p.missing.length) parts.push(t('prd.missingWarn', { n: p.missing.length, list: p.missing.slice(0, 5).map(m => `${t('prd.line', { n: m.line })} ${m.url}`).join('；') }))
            notify(parts.join('\n'), p.missing.length > 0)
          }
          await loadData(projectId, true)
          return true
        } catch (e) { notify(e.message, true); return false } finally { setPrdBusy(false) }
      }
      const doExport = async () => {
        try { const r = await api('export', { project: projectId }); notify(t('toast.exported', { file: r.file })) } catch (e) { notify(e.message, true) }
      }

      const quote = useCallback(async (text) => {
        const ok = props.insertDraft ? props.insertDraft(text, true) : 'blocked'
        if (ok === 'applied') notify(t('drawer.quoted'))
        else notify(t('create.draftKept'), true)
      }, [props.insertDraft, notify, t])

      const select = useCallback((next) => {
        setSel(cur => (cur && next && cur.id && cur.id === next.id) || (cur && next && cur.local && next.local && cur.local.id === next.local.id && cur.fid === next.fid) ? null : next)
      }, [])
      const openCard = useCallback(fid => { setCard(fid); setSel(null) }, [])

      if (error && !payload) {
        return h('div', { className: 'pdv' }, h(Style), h('div', { className: 'pdv-empty' }, h('h3', null, t('error')), h('p', null, error), h('button', { className: 'pdv-btn', onClick: () => { setError(null); void loadProjects(); void loadData(projectId) } }, t('retry'))))
      }
      if (!binding) {
        return h('div', { className: 'pdv' }, h(Style), bindError
          ? h('div', { className: 'pdv-empty' }, h('h3', null, t('error')), h('p', null, bindError), h('button', { className: 'pdv-btn', onClick: () => { void loadProjects() } }, t('retry')))
          : h('div', { className: 'pdv-empty' }, t('loading')))
      }
      if (!binding.project) {
        return h('div', { className: 'pdv' }, h(Style), h(UnboundPanel, { t, api, binding, store: props.store, sessionId: props.sessionId, insertDraft: props.insertDraft }))
      }

      const counts = payload?.derived?.counts
      const selId = sel?.id
      const related = sel?.id ? relatedOf(index, sel.id) : new Set()
      const ctx = { t, index, sel, selId, related, select, openCard, openList, goView: v => { setCard(null); setSel(null); setView(v) }, recent, search: search.trim().toLowerCase(), searchInput: h('input', { type: 'search', className: 'pdv-input search', 'aria-label': t('top.search'), placeholder: t('top.search'), value: search, onChange: e => setSearch(e.target.value) }), doSync, changePrd, prdBusy, api, prdFile: payload?.prdFile ?? null, prdMissing: Boolean(payload?.prdMissing), prdSource: payload?.prdSource ?? null, projectId, code, apply, quote, notify }

      let main
      if (!payload || !index) main = h('div', { className: 'pdv-empty' }, t('loading'))
      else if (card) main = h(CardView, { ...ctx, fid: card, onBack: () => { setCard(null); setSel(null) } })
      else if (view === 'features') main = h(FeatureMatrix, ctx)
      else if (view === 'list') main = h(ChecklistView, { ...ctx, key: 'list-' + preset.n, preset })
      else if (view === 'summary') main = h(SummaryView, ctx)
      else if (view === 'overview') main = h(OverviewView, ctx)
      else main = h(RulesView, ctx)

      const codeBadge = (() => {
        if (!code) return null
        if (code.configured === false) return h('span', { className: 'pdv-badge', title: t('top.noRepo') }, t('top.noRepo'))
        if (code.error) return h('span', { className: 'pdv-badge err', title: code.error }, 'git ⚠')
        if (!code.baseline) return h('span', { className: 'pdv-badge warn' }, t('top.noBaseline'))
        const changed = code.changedFiles > 0
        return h('span', { className: cx('pdv-badge', changed && 'warn'), title: `${t('top.baseline')} ${code.baseline}` },
          `${t('top.baseline')} ${String(code.baseline).slice(0, 7)}`, changed ? ' · ' + t('top.codeChanged', { n: code.changedFiles }) : '')
      })()

      return h('div', { ref: rootRef, className: cx('pdv', (selId || sel?.local) && 'has-sel') },
        h(Style),
        h(GenerationNotices, { t, api, project: projectId, store: props.store, sessionId: props.sessionId, insertDraft: props.insertDraft }),
        h('header', { className: 'pdv-head' },
          h('div', { className: 'pdv-title' },
            h('h2', { className: 'pdv-title-text', title: `${binding.project.title}\n${binding.project.relPath ?? binding.project.dataFile}` }, payload?.data?.meta?.title ?? binding.project.title)),
          h('nav', { className: 'pdv-nav' },
            ['summary', 'features', 'list', 'overview', 'rules'].map(v => h('button', { key: v, className: cx('pdv-tab', !card && view === v && 'on'), onClick: () => { if (v === 'list') { openList('none'); return } setCard(null); setView(v); setSel(null) } },
              t('nav.' + v),
              counts && v === 'features' ? h('span', { className: 'n' }, counts.features) : null,
              counts && v === 'list' ? h('span', { className: 'n' }, counts.issuesOpen + counts.adjustmentsOpen) : null,
              counts && v === 'summary' && counts.issuesBlockOpen ? h('span', { className: 'n alert' }, counts.issuesBlockOpen) : null))),
          h('div', { className: 'pdv-sub' },
            payload ? h('span', null, `${t('top.rev')} ${payload.data.revision}`) : null,
            payload?.data?.meta?.branch ? h(Fragment, null, h('span', { className: 'dot' }), h('span', { className: 'branch', title: payload.data.meta.branch }, payload.data.meta.branch)) : null,
            h('span', { className: 'dot' }), codeBadge),
          h('div', { className: 'pdv-head-actions' },
            h('button', { className: 'pdv-btn', onClick: () => { void loadProjects(); void loadData(projectId); void loadCode(projectId) } }, t('top.refresh')),
            h('button', { className: 'pdv-btn', onClick: doExport, disabled: !projectId }, t('top.export')))),
        h('div', { className: 'pdv-body' },
          h('div', { className: cx('pdv-main', !card && view === 'features' && 'matrix-page'), onClick: e => { if (e.target === e.currentTarget) setSel(null) } }, main),
          sel && index ? h(Drawer, { ...ctx, fid: card, onClose: () => setSel(null) }) : null),
        h(Toast, { toast }))
    }

    // ------------------------------------------------------------ 公共小部件
    function dimClass(ctx, id, extraMatch) {
      const isSel = ctx.selId === id
      const isRel = ctx.related.has(id)
      const hit = ctx.search && extraMatch !== undefined && extraMatch
      return cx('pdv-dimmable', isSel && 'is-sel', isRel && 'is-rel', hit && 'is-hit', ctx.recent.has(id) && 'is-recent')
    }

    const PRESETS = {
      block: { type: 'issue', prog: 'open', blockOnly: true, reviewOnly: false },
      issues: { type: 'issue', prog: 'open', blockOnly: false, reviewOnly: false },
      adj: { type: 'adjustment', prog: 'open', blockOnly: false, reviewOnly: false },
      closed: { type: 'all', prog: 'closed', blockOnly: false, reviewOnly: false },
      review: { type: 'all', prog: 'all', blockOnly: false, reviewOnly: true },
      none: { type: 'all', prog: 'open', blockOnly: false, reviewOnly: false },
    }

    function Kpi({ c, v, of, l, on, onClick }) {
      return h('button', { className: cx('pdv-kpi', !v && 'zero', on && 'on'), style: { '--c': c }, onClick, 'aria-pressed': on ? 'true' : 'false' },
        h('span', { className: 'v' }, v ?? 0, of !== undefined ? h('small', null, '/ ' + of) : null),
        h('span', { className: 'l' }, l))
    }

    function Mini({ ctx, id, onDouble }) {
      const e = ctx.index.byId.get(id)
      const label = e ? (e.item.title ?? e.item.name ?? '') : ''
      return h('span', {
        className: cx('pdv-mini', e && 'k-' + e.kind, dimClass(ctx, id), ctx.index.closed(id) && 'closed'),
        title: label, onClick: ev => { ev.stopPropagation(); ctx.select({ id }) },
        onDoubleClick: onDouble ? ev => { ev.stopPropagation(); onDouble(id) } : undefined,
      }, h('span', { className: 'pdv-id' }, id), label ? h('span', { className: 'lbl' }, truncate(label, 16)) : null)
    }

    const truncate = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s))
    const matchText = (ctx, ...parts) => Boolean(ctx.search) && parts.some(p => p && String(p).toLowerCase().includes(ctx.search))

    function Prog({ ctx, kind, progress }) {
      return h('span', { className: cx('pdv-prog', 'pg-' + progress) }, ctx.t('p.' + progress))
    }

    // ------------------------------------------------------------ 功能矩阵
    function FeatureMatrix(ctx) {
      const { t, index } = ctx
      const { data, derived } = index
      const [statusFilter, setStatusFilter] = useState(null)
      const [blockOnly, setBlockOnly] = useState(false)
      const [reviewOnly, setReviewOnly] = useState(false)
      const blockFeatures = useMemo(() => new Set(arr(data.issues).filter(q => q.sev === 'block' && !index.closed(q.id)).flatMap(q => arr(q.features))), [data])
      const visible = f => (!ctx.search || matchText(ctx, f.id, f.name, f.goal, ...arr(derived.featureQs[f.id]), ...arr(derived.featureAdj[f.id]))) && (!statusFilter || f.status === statusFilter) && (!blockOnly || blockFeatures.has(f.id)) && (!reviewOnly || f.review?.state === 'pending' || arr(derived.featureQs[f.id]).concat(arr(derived.featureAdj[f.id])).some(id => index.byId.get(id)?.item.review?.state === 'pending'))
      const objs = arr(data.objs), caps = arr(data.caps)
      const cellFeatures = (o, c) => arr(data.features).filter(f => f.obj === oid(o) && f.cap === oid(c) && visible(f))
      const orphan = arr(data.features).filter(f => (!objs.some(o => oid(o) === f.obj) || !caps.some(c => oid(c) === f.cap)) && visible(f))
      const capCount = c => arr(data.features).filter(f => f.cap === oid(c) && visible(f)).length
      const objCount = o => arr(data.features).filter(f => f.obj === oid(o) && visible(f)).length
      // 没有任何功能的能力列不显示，避免整列空白稀释信息
      const shownCaps = caps.filter(c => arr(data.features).some(f => f.cap === oid(c)))
      return h(Fragment, null,
        h('div', { className: 'pdv-bar' },
          ctx.searchInput,
          h('span', { className: 'lbl' }, t('filter.status')),
          h('div', { className: 'pdv-seg' },
            h('button', { className: !statusFilter ? 'on' : '', onClick: () => setStatusFilter(null) }, t('filter.all')),
            ['new', 'change', 'minor', 'ok', 'pending'].map(s => h('button', { key: s, className: statusFilter === s ? 'on' : '', onClick: () => setStatusFilter(statusFilter === s ? null : s) }, t('fs.' + s)))),
          h('span', { className: 'sep' }),
          h('label', { className: 'pdv-check' }, h('input', { type: 'checkbox', checked: blockOnly, onChange: e => setBlockOnly(e.target.checked) }), t('filter.blockOnly')),
          h('label', { className: 'pdv-check' }, h('input', { type: 'checkbox', checked: reviewOnly, onChange: e => setReviewOnly(e.target.checked) }), t('filter.reviewOnly')),
          h('span', { className: 'pdv-spacer' }),
          h('div', { className: 'pdv-legend' },
            ['new', 'change', 'minor', 'ok', 'pending'].map(s => h('span', { key: s, className: 'st-' + s }, h('i'), t('fs.' + s))),
            h('span', { className: 'pdv-cnt q' }, 'Q'), h('span', null, t('legend.q')),
            h('span', { className: 'pdv-cnt a' }, 'A'), h('span', null, t('legend.a')))),
        h('div', { className: 'pdv-mwrap' },
          h('table', { className: 'pdv-matrix' },
            h('thead', null, h('tr', null,
              h('th', { className: 'corner' }, t('matrix.corner')),
              shownCaps.map(c => h('th', { key: oid(c) }, h('span', { className: 'cap' }, oname(c)), h('span', { className: 'cnt' }, t('matrix.count', { n: capCount(c) })))))),
            h('tbody', null, objs.map(o => h('tr', { key: oid(o) },
              h('td', { className: 'rowh' }, h('span', { className: 'obj' }, oname(o)), osub(o) ? h('small', null, osub(o)) : null, h('span', { className: 'cnt' }, t('matrix.count', { n: objCount(o) }))),
              shownCaps.map(c => { const fs = cellFeatures(o, c); return h('td', { key: oid(c), className: fs.length ? '' : 'empty' }, fs.map(f => h(FeatureChip, { key: f.id, ctx, f, blk: blockFeatures.has(f.id) }))) })))))),
        orphan.length ? h('div', { style: { marginTop: 10 } }, orphan.map(f => h(FeatureChip, { key: f.id, ctx, f }))) : null,
        h('div', { className: 'pdv-hint', style: { marginTop: 8 } }, t('matrix.hint')))
    }

    function FeatureChip({ ctx, f, blk }) {
      const rem = ctx.index.derived.featureRemaining[f.id] ?? { qs: 0, adj: 0 }
      const missing = !ctx.index.data.cards[f.id]
      const review = f.review?.state === 'pending'
      return h('div', {
        className: cx('pdv-chip', 'st-' + f.status, dimClass(ctx, f.id, matchText(ctx, f.id, f.name))),
        title: `${f.id} ${f.name}`, tabIndex: 0, role: 'button',
        onKeyDown: e => { if (e.key === 'Enter') { e.preventDefault(); ctx.openCard(f.id) } else if (e.key === ' ') { e.preventDefault(); ctx.select({ id: f.id }) } },
        onClick: e => { e.stopPropagation(); ctx.select({ id: f.id }) },
        onDoubleClick: e => { e.stopPropagation(); ctx.openCard(f.id) },
      },
      h('button', { className: 'open', title: ctx.t('drawer.openCard'), onClick: e => { e.stopPropagation(); ctx.openCard(f.id) } }, '›'),
      h('span', { className: 'nm' }, h('span', { className: 'pdv-id' }, f.id), f.name),
      h('span', { className: 'meta' },
        h('span', { className: 'st' }, ctx.t('fs.' + f.status)),
        blk ? h('span', { className: 'pdv-cnt blk' }, ctx.t('stat.block')) : null,
        rem.qs ? h('span', { className: 'pdv-cnt q', title: ctx.t('legend.q') }, `Q ${rem.qs}`) : null,
        rem.adj ? h('span', { className: 'pdv-cnt a', title: ctx.t('legend.a') }, `A ${rem.adj}`) : null,
        review ? h('span', { className: 'pdv-cnt rv' }, '⟳ ' + ctx.t('flag.review')) : null,
        missing ? h('span', { className: 'pdv-cnt miss' }, ctx.t('card.missing')) : null))
    }

    // ------------------------------------------------------------ 总清单
    function ChecklistView(ctx) {
      const { t, index } = ctx
      const rows = index.derived.rows
      const init = PRESETS[ctx.preset?.kpi] ?? PRESETS.none
      const [type, setType] = useState(init.type)
      const [prog, setProg] = useState(init.prog)
      const [group, setGroup] = useState('none')
      const [reviewOnly, setReviewOnly] = useState(init.reviewOnly)
      const [blockOnly, setBlockOnly] = useState(init.blockOnly)
      const [foldClosed, setFoldClosed] = useState(init.prog !== 'closed')
      const [folded, setFolded] = useState(() => new Set())
      const featureName = id => index.byId.get(id)?.item.name ?? id
      const filtered = rows.filter(r =>
        (type === 'all' || r.kind === type)
        && (prog === 'all' || (prog === 'open' ? !r.closed : r.closed) || (prog === 'open' && r.closed))
        && (!reviewOnly || r.review)
        && (!blockOnly || (r.sev === 'block' && !r.closed))
        && (!ctx.search || matchText(ctx, r.id, r.title, r.features.join(' '), r.features.map(featureName).join(' '))))
      const openRows = filtered.filter(r => !r.closed || prog !== 'open')
      const closedRows = prog === 'open' ? filtered.filter(r => r.closed) : []
      const sevOrder = { block: 0, impact: 1, low: 2 }
      const sorted = list => [...list].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'issue' ? -1 : 1) || ((sevOrder[a.sev] ?? 3) - (sevOrder[b.sev] ?? 3)) || natural(a.id, b.id))
      const groups = (() => {
        if (group === 'none') return [{ key: '', label: '', rows: sorted(openRows) }]
        const map = new Map()
        const put = (key, label, r) => { if (!map.has(key)) map.set(key, { key, label, rows: [] }); map.get(key).rows.push(r) }
        for (const r of openRows) {
          if (group === 'feature') { if (!r.features.length) put('-', '—', r); for (const f of r.features) put(f, `${f} ${featureName(f)}`, r) }
          else if (group === 'sev') put(r.kind === 'issue' ? r.sev : 'adj-' + r.nature, r.kind === 'issue' ? t('sev.' + r.sev) : t('kind.adjustment') + ' · ' + t('an.' + r.nature), r)
          else if (group === 'nature') put(r.kind === 'issue' ? r.type : r.nature, r.kind === 'issue' ? r.type : t('an.' + r.nature), r)
          else put(r.progress, t('p.' + r.progress), r)
        }
        return [...map.values()].sort((a, b) => natural(a.key, b.key)).map(g => ({ ...g, rows: sorted(g.rows) }))
      })()
      const toggleFold = key => setFolded(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
      const natureCls = n => (n === 'new' ? 'st-new' : n === 'ok' ? 'st-ok' : n === 'defer' || n === 'pending' || n === 'confirm' ? 'st-pending' : 'st-change')
      const rowEl = r => h('tr', { key: r.id + (r._g ?? ''), className: cx('row', 'k-' + r.kind, r.closed && 'closed', dimClass(ctx, r.id)), tabIndex: 0, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.select({ id: r.id }) } }, onClick: () => ctx.select({ id: r.id }) },
        h('td', { className: 'idc' }, h('span', { className: 'pdv-id' }, r.id)),
        h('td', null, h('span', { className: cx('pdv-kind', 'k-' + r.kind) }, r.kind === 'issue' ? r.type : t('kind.adjustment'))),
        h('td', null, h('span', { className: 'ttl' }, r.title)),
        h('td', null, r.kind === 'issue' ? h('span', { className: cx('pdv-pill', 'sev-' + r.sev, r.sev === 'block' && !r.closed && 'solid') }, t('sev.' + r.sev)) : h('span', { className: cx('pdv-pill', natureCls(r.nature)) }, t('an.' + r.nature))),
        h('td', null, h(Prog, { ctx, kind: r.kind, progress: r.progress })),
        h('td', null, r.features.map(f => h(Mini, { key: f, ctx, id: f, onDouble: ctx.openCard }))),
        h('td', null,
          r.review ? h('span', { className: 'pdv-flag' }, '⟳ ' + t('flag.review')) : null,
          r.blockedBy && r.blockedBy.length ? h('span', { className: 'pdv-flag blk' }, t('flag.blocked', { ids: r.blockedBy.join('、') })) : null),
        h('td', { className: 'pdv-hint' }, shortDate(r.lastChange)))
      return h(Fragment, null,
        h('div', { className: 'pdv-bar' },
          ctx.searchInput,
          h('span', { className: 'lbl' }, t('list.type')), h(Seg, { value: type, onChange: setType, options: [['all', t('list.typeAll')], ['issue', t('list.typeIssue')], ['adjustment', t('list.typeAdj')]] }),
          h('span', { className: 'sep' }),
          h('span', { className: 'lbl' }, t('list.progress')), h(Seg, { value: prog, onChange: setProg, options: [['open', t('list.open')], ['closed', t('list.closed')], ['all', t('list.allProgress')]] }),
          h('span', { className: 'sep' }),
          h('span', { className: 'lbl' }, t('list.group')), h(Seg, { value: group, onChange: setGroup, options: [['none', t('group.none')], ['feature', t('group.feature')], ['sev', t('group.sev')], ['nature', t('group.nature')], ['progress', t('group.progress')]] }),
          h('span', { className: 'sep' }),
          h('label', { className: 'pdv-check' }, h('input', { type: 'checkbox', checked: blockOnly, onChange: e => setBlockOnly(e.target.checked) }), t('stat.block')),
          h('label', { className: 'pdv-check' }, h('input', { type: 'checkbox', checked: reviewOnly, onChange: e => setReviewOnly(e.target.checked) }), t('filter.reviewOnly'))),
        h('div', { className: 'pdv-twrap' }, h('table', { className: 'pdv-table' },
          h('thead', null, h('tr', null, ['id', 'kind', 'title', 'level', 'progress', 'features', 'flags', 'changed'].map(k => h('th', { key: k }, t('list.col.' + k))))),
          h('tbody', null,
            groups.map(g => h(Fragment, { key: g.key },
              g.label ? h('tr', { className: 'grp', onClick: () => toggleFold(g.key) }, h('td', { colSpan: 8 }, (folded.has(g.key) ? '▸ ' : '▾ ') + g.label, h('span', { className: 'n' }, g.rows.length))) : null,
              folded.has(g.key) ? null : g.rows.map(r => rowEl({ ...r, _g: g.key })))),
            closedRows.length ? h(Fragment, null,
              h('tr', { className: 'grp done', onClick: () => setFoldClosed(!foldClosed) }, h('td', { colSpan: 8 }, (foldClosed ? '▸ ✓ ' : '▾ ✓ ') + t('list.closedFold', { n: closedRows.length }))),
              foldClosed ? null : sorted(closedRows).map(rowEl)) : null,
            !openRows.length && !closedRows.length ? h('tr', null, h('td', { colSpan: 8, className: 'pdv-hint' }, t('list.empty'))) : null))))
    }

    function Seg({ value, onChange, options }) {
      return h('div', { className: 'pdv-seg' }, options.map(([v, label]) => h('button', { key: v, className: value === v ? 'on' : '', onClick: () => onChange(v) }, label)))
    }

    const natural = (a, b) => String(a).localeCompare(String(b), 'zh', { numeric: true })

    // ------------------------------------------------------------ 完整卡片
    function cardModel(card) {
      const stages = arr(card.stages)
      const nodes = new Map()
      const put = (id, kind, item, col) => { if (id) nodes.set(id, { id, kind, item, col }) }
      for (const p of arr(card.pre)) put(p.id, 'pre', p, 0)
      stages.forEach((st, i) => { for (const s of arr(card.steps?.[st.id])) put(s.id, 'step', s, i) })
      for (const r of arr(card.rules)) put(r.id, 'rule', r)
      for (const x of arr(card.adj)) put(x.id, 'adj', x)
      for (const x of arr(card.qs)) put(x.id, 'qs', x)
      for (const x of arr(card.compat)) put(x.id, 'compat', x)
      for (const x of arr(card.related)) put(x.id, 'related', x)
      // 关联：links + 步骤上的 rules，双向
      const rel = new Map()
      const link = (a, b) => { if (!a || !b || a === b) return; if (!rel.has(a)) rel.set(a, new Set()); if (!rel.has(b)) rel.set(b, new Set()); rel.get(a).add(b); rel.get(b).add(a) }
      for (const n of nodes.values()) {
        for (const l of arr(n.item.links)) link(n.id, l)
        for (const r of arr(n.item.rules)) link(n.id, r)
      }
      if (card.banner?.adj) link(card.banner.adj, card.banner.adj)
      return { stages, nodes, rel }
    }

    function CardView(ctx) {
      const { t, index, fid } = ctx
      const f = index.byId.get(fid)?.item
      const card = index.data.cards[fid]
      const [mode, setMode] = useState('full')
      const [layers, setLayers] = useState({ steps: true, adj: true, qs: true, compat: true, related: true })
      if (!f) return h('div', { className: 'pdv-empty' }, fid)
      const header = h(Fragment, null,
        h('div', { className: 'pdv-crumb' },
          h('button', { className: 'pdv-btn', onClick: ctx.onBack }, '← ' + t('card.back')),
          h('span', { className: 'pdv-hint' }, t('nav.features') + ' › '), h('b', null, `${fid} ${f.name}`),
          h('span', { className: 'pdv-spacer' }),
          h(Seg, { value: mode, onChange: setMode, options: [['full', t('card.full')], ['simple', t('card.simple')]] })),
        h('div', { className: cx('pdv-chead', 'st-' + f.status) },
          h('div', null, h('span', { className: 'pdv-id' }, fid), h('span', { className: 't' }, card?.title ?? f.name), h('span', { className: cx('pdv-pill', 'st-' + f.status) }, t('fs.' + f.status)),
            ' ', (index.derived.featureRemaining[fid]?.qs ? h('span', { className: 'pdv-cnt q' }, `Q ${index.derived.featureRemaining[fid].qs}`) : null),
            ' ', (index.derived.featureRemaining[fid]?.adj ? h('span', { className: 'pdv-cnt a' }, `A ${index.derived.featureRemaining[fid].adj}`) : null)),
          card?.meta ? h('div', { className: 'meta' }, arr(card.meta).map((m, i) => h('span', { key: i }, Array.isArray(m) ? h(Fragment, null, m[0], ' ', h('b', null, m[1])) : String(m)))) : null,
          card?.lead ? h('div', { className: 'lead' }, card.lead) : null,
          card?.banner ? h('div', { className: cx('pdv-banner', dimClass(ctx, card.banner.adj)), onClick: e => { e.stopPropagation(); ctx.select({ id: card.banner.adj }) } }, h('span', { className: 'pdv-id' }, card.banner.adj), ' ', card.banner.text) : null))
      if (mode === 'simple' || !card) {
        return h(Fragment, null, header, !card ? h('div', { className: 'pdv-hint', style: { marginBottom: 8 } }, t('card.missing')) : null, h(SimpleCard, { ctx, f }))
      }
      return h(Fragment, null, header,
        h('div', { className: 'pdv-bar' },
          ['steps', 'adj', 'qs', 'compat', 'related'].map(k => h('label', { key: k, className: cx('pdv-check', 'L-' + k), style: { color: 'var(--L)', fontWeight: 600 } }, h('input', { type: 'checkbox', checked: layers[k], onChange: e => setLayers({ ...layers, [k]: e.target.checked }) }), t('layer.' + k))),
          h('span', { className: 'pdv-spacer' }), h('span', { className: 'pdv-hint' }, t('card.lineHint'))),
        h(FullCard, { ctx, fid, card, layers }))
    }

    function FullCard({ ctx, fid, card, layers }) {
      const { t, index } = ctx
      const model = useMemo(() => cardModel(card), [card])
      const { stages } = model
      const n = stages.length
      const wrapRef = useRef(null)
      const gridRef = useRef(null)
      const [lines, setLines] = useState([])
      const [size, setSize] = useState({ w: 0, h: 0 })
      const selLocal = ctx.sel?.local && ctx.sel.fid === fid ? ctx.sel.local.id : (ctx.sel?.id && model.nodes.has(ctx.sel.id) ? ctx.sel.id : null)
      const relLocal = selLocal ? (model.rel.get(selLocal) ?? new Set()) : new Set()
      const pick = node => ev => {
        ev.stopPropagation()
        const globalKinds = { adj: true, qs: true, related: true }
        if (globalKinds[node.kind] && index.byId.has(node.id)) ctx.select({ id: node.id, cardLocal: node.id })
        else ctx.select({ local: node, fid })
      }
      const nodeCls = id => cx('pdv-dimmable', selLocal === id && 'is-sel', relLocal.has(id) && 'is-rel', ctx.recent.has(id) && 'is-recent')

      const recompute = useCallback(() => {
        const grid = gridRef.current
        if (!grid) return
        setSize({ w: grid.scrollWidth, h: grid.scrollHeight })
        if (!selLocal) { setLines([]); return }
        const base = grid.getBoundingClientRect()
        const esc = s => String(s).replace(/["\\]/g, '\\$&')
        const find = id => grid.querySelector(`[data-nid="${esc(id)}"]`) ?? grid.querySelector(`[data-nid^="${esc(id)}@"]`)
        const from = find(selLocal)
        if (!from) { setLines([]); return }
        const box = el => { const r = el.getBoundingClientRect(); return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height } }
        const a = box(from)
        const out = []
        for (const id of relLocal) {
          const el = find(id)
          if (!el) continue
          const b = box(el)
          const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2
          const sx = bx >= ax ? a.x + a.w : a.x, ex = bx >= ax ? b.x : b.x + b.w
          const sameCol = Math.abs(ax - bx) < Math.min(a.w, b.w) / 2
          const p = sameCol
            ? `M${a.x + a.w} ${ay} C${a.x + a.w + 40} ${ay} ${b.x + b.w + 40} ${by} ${b.x + b.w} ${by}`
            : `M${sx} ${ay} C${(sx + ex) / 2} ${ay} ${(sx + ex) / 2} ${by} ${ex} ${by}`
          out.push({ id, d: p, end: sameCol ? [b.x + b.w, by] : [ex, by] })
        }
        setLines(out)
      }, [selLocal, relLocal.size, layers])
      useLayoutEffect(() => { recompute() }, [recompute, card])
      useEffect(() => {
        const grid = gridRef.current
        if (!grid || typeof ResizeObserver === 'undefined') return undefined
        const ro = new ResizeObserver(() => recompute())
        ro.observe(grid)
        return () => ro.disconnect()
      }, [recompute])

      const cols = `140px repeat(${n}, minmax(230px, 1fr))`
      const sub = `repeat(${n}, minmax(230px, 1fr))`
      const spanCol = x => { const s = arr(x.span); const a = Math.max(0, s[0] ?? 0), b = Math.min(n - 1, s[1] ?? a); return `${a + 1} / ${b + 2}` }
      const globalItem = id => index.byId.get(id)?.item
      const rulesById = new Map(arr(card.rules).map(r => [r.id, r]))

      const stepNode = (s) => h('div', { key: s.id, 'data-nid': s.id, className: cx('pdv-node', s.tag && 'tag-' + tagKey(s.tag), nodeCls(s.id)), onClick: pick(model.nodes.get(s.id)) },
        h('div', { className: 'hd' }, h('span', { className: 'pdv-id' }, s.id), h('b', null, s.t), s.tag ? h('span', { className: 'pdv-tagp' }, s.tag) : null),
        s.d ? h('div', { className: 'd' }, s.d) : null,
        arr(s.rules).length ? h('div', { className: 'rules' }, arr(s.rules).map(rid => {
          const r = rulesById.get(rid)
          return h('span', { key: rid, 'data-nid': rid + '@' + s.id, className: cx('pdv-rule', nodeCls(rid)), title: r?.what ?? '', onClick: pick(model.nodes.get(rid) ?? { id: rid, kind: 'rule', item: r ?? { id: rid } }) },
            h('span', { className: 'pdv-id' }, rid), r ? truncate(r.name ?? '', 12) : '')
        })) : null)
      const preNode = p => h('div', { key: p.id, 'data-nid': p.id, className: cx('pdv-node pre', nodeCls(p.id)), onClick: pick(model.nodes.get(p.id)) },
        h('div', { className: 'hd' }, h('span', { className: 'pdv-id' }, p.id), h('b', null, p.cond)), p.act ? h('div', { className: 'd' }, '→ ' + p.act) : null)

      const spanEl = (x, kind) => {
        const g = globalItem(x.id)
        const closed = index.closed(x.id)
        const sevCls = kind === 'qs' && g ? 'sev-' + g.sev : kind === 'adj' && g ? 'st-' + (g.status === 'new' ? 'new' : g.status === 'ok' ? 'ok' : 'change') : kind === 'compat' ? 'st-pending' : ''
        const title = kind === 'compat' ? (x.name ?? x.id) : (g?.title ?? x.id)
        return h('div', { key: x.id, 'data-nid': x.id, className: cx('pdv-span', sevCls, closed && 'closed', nodeCls(x.id), ctx.selId === x.id && 'is-sel', ctx.related.has(x.id) && 'is-rel'), style: { gridColumn: spanCol(x) }, onClick: pick(model.nodes.get(x.id)) },
          h('div', null, h('span', { className: 'pdv-id' }, x.id), ' ', h('span', { className: 'tt' }, title), ' ',
            g && (kind === 'adj' || kind === 'qs') ? h(Prog, { ctx, kind, progress: g.progress }) : null,
            g?.review?.state === 'pending' ? h('span', { className: 'pdv-flag', style: { display: 'inline', marginLeft: 6 } }, '⟳') : null),
          arr(x.ends).length ? h('div', { className: 'ends' }, h('span', null, x.ends[0]), h('span', null, x.ends[1] ?? '')) : null)
      }

      const layerRow = (key, items, kind) => (layers[key] && items.length ? [
        h('div', { key: key + '-h', className: cx('lh', 'L-' + key), style: { gridColumn: '1' } }, t('layer.' + key), h('div', { className: 'pdv-hint', style: { fontWeight: 400 } }, items.length)),
        h('div', { key: key + '-l', className: cx('pdv-layer', 'L-' + key), style: { gridColumn: `2 / ${n + 2}`, gridTemplateColumns: sub } }, items.map(x => spanEl(x, kind))),
      ] : [])

      return h('div', { className: 'pdv-cgrid-wrap', ref: wrapRef },
        h('div', { className: 'pdv-cgrid', ref: gridRef, style: { gridTemplateColumns: cols }, onClick: () => ctx.select(null) },
          h('div', { className: 'sh corner', style: { gridColumn: '1' } }, h('span', { className: 'pdv-hint' }, t('card.stage'))),
          stages.map((st, i) => h('div', { key: st.id, className: cx('sh', i === 0 && 'pre'), title: st.desc ?? '' }, h('span', { className: 'no' }, i === 0 ? '·' : i), h('div', null, st.name, st.sub ? h('small', null, st.sub) : null))),
          layers.steps ? [
            h('div', { key: 'steps-h', className: 'lh L-steps' }, t('layer.steps')),
            ...stages.map((st, i) => h('div', { key: 'c' + st.id, className: cx('cell', i === 0 && 'pre') },
              i === 0 ? arr(card.pre).map(preNode) : arr(card.steps?.[st.id]).map(stepNode))),
          ] : null,
          ...layerRow('adj', arr(card.adj), 'adj'),
          ...layerRow('qs', arr(card.qs), 'qs'),
          ...layerRow('compat', arr(card.compat), 'compat'),
          layers.related && arr(card.related).length ? [
            h('div', { key: 'rel-h', className: 'lh L-related' }, t('layer.related')),
            h('div', { key: 'rel-l', className: 'pdv-layer L-related', style: { gridColumn: `2 / ${n + 2}`, display: 'flex', flexWrap: 'wrap', padding: '8px' } },
              arr(card.related).map(r => h('span', { key: r.id, 'data-nid': r.id, className: cx('pdv-mini', 'k-feature', nodeCls(r.id)), onClick: pick(model.nodes.get(r.id)), onDoubleClick: e => { e.stopPropagation(); ctx.openCard(r.id) } },
                h('span', { className: 'pdv-id' }, r.id), ' ', index.byId.get(r.id)?.item.name ?? ''))),
          ] : null,
          h('svg', { className: 'pdv-lines', width: size.w, height: size.h },
            lines.map(l => h('g', { key: l.id }, h('path', { d: l.d }), h('circle', { cx: l.end[0], cy: l.end[1], r: 3 }))))))
    }
    const i0 = x => x
    const tagKey = tag => ({ 沿用: 'keep', 调整: 'adjust', 缺口: 'gap', 需改: 'need' }[tag] ?? 'keep')

    function SimpleCard({ ctx, f }) {
      const { t, index } = ctx
      const d = index.derived
      const box = (title, body, c) => h('div', { className: 'pdv-box', style: c ? { '--c': c } : undefined }, h('h4', null, title), body)
      const list = ids => (arr(ids).length ? h('div', null, arr(ids).map(id => h(Mini, { key: id, ctx, id, onDouble: index.byId.get(id)?.kind === 'feature' ? ctx.openCard : undefined }))) : h('span', { className: 'pdv-hint' }, '—'))
      return h(Fragment, null,
        h('div', { className: 'pdv-simple' },
          box(t('card.prd'), h('p', null, f.prd ?? '—'), 'var(--pdv-accent)'),
          box(t('card.now'), h('p', null, f.now ?? '—'), 'var(--pdv-fg2)'),
          box(t('card.todo'), h('p', null, f.todo ?? '—'), 'var(--pdv-warn)')),
        h('div', { className: 'pdv-simple' },
          box(t('card.issues'), list(d.featureQs[f.id]), 'var(--pdv-err)'),
          box(t('card.adjs'), list(d.featureAdj[f.id]), 'var(--pdv-warn)'),
          box(t('card.rules'), list(Object.keys(d.featureRules[f.id] ?? {})), 'var(--pdv-violet)')),
        h('div', { className: 'pdv-simple' },
          box(t('card.mods'), list(d.featureMods[f.id])),
          box(t('card.related'), list(f.rel), 'var(--pdv-accent)'),
          box(t('drawer.code'), h('div', { className: 'pdv-code' }, codeText(f.code) || '—'))))
    }

    const codeText = c => (Array.isArray(c) ? c.join('\n') : c ?? '')

    // ------------------------------------------------------------ 全貌
    function OverviewView(ctx) {
      const { t, index } = ctx
      const { data } = index
      const lc = data.lifecycle ?? {}
      const states = arr(lc.states)
      const itemEl = (it, i) => (it.f ? h('div', { key: i }, h(Mini, { ctx, id: it.f, onDouble: ctx.openCard }), it.label ? h('span', { className: 'pdv-hint' }, it.label) : null) : h('div', { key: i, className: 'pdv-txt' }, it.text))
      return h(Fragment, null,
        h('div', { className: 'pdv-sec' },
          h('h3', null, t('overview.lifecycle'), lc.title ? ' · ' + lc.title : ''),
          arr(lc.start).length ? h('div', { className: 'pdv-bar' }, t('overview.start'), arr(lc.start).map((s, i) => h(Mini, { key: i, ctx, id: s.f, onDouble: ctx.openCard }))) : null,
          h('div', { className: 'pdv-life' }, states.map((st, i) => h(Fragment, { key: i },
            h('div', { className: 'pdv-state' }, h('h5', null, st.name), st.note ? h('small', null, st.note) : null, arr(st.items).map(itemEl)),
            i < states.length - 1 ? h('div', { className: 'pdv-gap' },
              h('div', null, arr(lc.gaps?.[i]?.fwd).map(itemEl)),
              h('div', { className: 'arr' }),
              arr(lc.gaps?.[i]?.back).length ? h(Fragment, null, h('div', { className: 'arr back' }), h('div', null, arr(lc.gaps[i].back).map(itemEl))) : null,
              arr(lc.gaps?.[i]?.extra).map(itemEl)) : null))),
          arr(lc.loops).length ? h('div', { className: 'pdv-bar', style: { marginTop: 8 } }, t('overview.loops'),
            arr(lc.loops).map((l, i) => h('span', { key: i }, `${states[l.from]?.name ?? l.from} ⇢ ${states[l.to]?.name ?? l.to} `, l.f ? h(Mini, { ctx, id: l.f, onDouble: ctx.openCard }) : null, l.label ? h('span', { className: 'pdv-hint' }, l.label) : null))) : null,
          arr(lc.always).length ? h('div', { className: 'pdv-bar' }, t('overview.always'), arr(lc.always).map((s, i) => h(Mini, { key: i, ctx, id: s.f, onDouble: ctx.openCard }))) : null),
        arr(data.chain).length ? h('div', { className: 'pdv-sec' }, h('h3', null, t('overview.chain')),
          arr(data.chain).map((c, i) => h('div', { key: i, className: 'pdv-chain' }, h('b', null, c.name), arr(c.steps).map((s, j) => h(Fragment, { key: j }, j ? h('span', { className: 'sep' }, '→') : null, s.f ? h(Mini, { ctx, id: s.f, onDouble: ctx.openCard }) : null, h('span', { className: 'pdv-hint' }, s.t)))))) : null,
        h('div', { className: 'pdv-sec' }, h('h3', null, t('overview.map')), h(ObjectMap, { ctx })))
    }

    function ObjectMap({ ctx }) {
      const { index } = ctx
      const map = index.data.objMap ?? {}
      const nodes = Object.entries(map.nodes ?? {})
      if (!nodes.length) return h('div', { className: 'pdv-hint' }, '—')
      const W = map.width ?? 1000, H = map.height ?? 400
      const pos = Object.fromEntries(nodes.map(([id, v]) => [id, { x: v[0], y: v[1] }]))
      const bw = 150, bh = 44
      const cls = id => {
        const e = index.byId.get(id)
        const sel = ctx.selId === id, rel = ctx.related.has(id)
        return cx('n', e?.kind === 'object' && 'own', e?.kind === 'module' && 'need-' + e.item.need, ctx.selId && !sel && !rel && 'dim', (sel || rel) && 'rel')
      }
      return h('svg', { className: 'pdv-map', viewBox: `0 0 ${W} ${H}` },
        arr(map.edges).map((e, i) => {
          const a = pos[e[0]], b = pos[e[1]]
          if (!a || !b) return null
          const dim = ctx.selId && ![e[0], e[1]].includes(ctx.selId)
          return h('g', { key: i, className: cx('e', dim && 'dim') },
            h('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }),
            e[2] ? h('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 4, textAnchor: 'middle' }, e[2]) : null)
        }),
        nodes.map(([id, v]) => h('g', { key: id, className: cls(id), onClick: ev => { ev.stopPropagation(); ctx.select({ id }) } },
          h('rect', { x: v[0] - bw / 2, y: v[1] - bh / 2, width: bw, height: bh, rx: 8 }),
          h('text', { x: v[0], y: v[1] - (v[3] ? 3 : -4), textAnchor: 'middle' }, truncate(v[2] ?? id, 12)),
          v[3] ? h('text', { className: 'sub', x: v[0], y: v[1] + 14, textAnchor: 'middle' }, truncate(v[3], 16)) : null)))
    }

    // ------------------------------------------------------------ 总览
    function SummaryView(ctx) {
      const { t, index } = ctx
      const { data, derived } = index
      const counts = derived.counts
      const issues = arr(data.issues), adjs = arr(data.adjustments)
      const blocking = issues.filter(q => q.sev === 'block' && !index.closed(q.id))
      const reviewing = [...arr(data.features), ...issues, ...adjs].filter(x => x.review?.state === 'pending')
      const recentLog = arr(data.log).slice(-8).reverse()
      const statusCount = s => arr(data.features).filter(f => f.status === s).length
      const total = Math.max(1, arr(data.features).length)
      const remaining = arr(data.features).map(f => ({ f, r: derived.featureRemaining[f.id] ?? { qs: 0, adj: 0 } }))
        .filter(x => x.r.qs + x.r.adj > 0).sort((a, b) => (b.r.qs + b.r.adj) - (a.r.qs + a.r.adj)).slice(0, 6)
      const row = (id, title, tail) => h('div', { key: id, className: cx('pdv-lrow', dimClass(ctx, id)), tabIndex: 0, onClick: () => ctx.select({ id }), onKeyDown: e => { if (e.key === 'Enter') ctx.select({ id }) } },
        h('span', { className: 'pdv-id' }, id), h('span', { className: 'ttl' }, title), tail ? h('span', { className: 'tail' }, tail) : null)
      const none = h('div', { className: 'pdv-hint' }, t('sum.none'))
      return h(Fragment, null,
        h(PrdBar, { ctx, data }),
        h('div', { className: 'pdv-bar pdv-summary-tools' },
          h('button', { className: 'pdv-btn', onClick: ctx.doSync, disabled: !ctx.projectId }, t('top.sync')),
          h('span', { className: 'pdv-hint' }, ctx.code?.error ?? (ctx.code?.configured === false ? t('top.noRepo') : !ctx.code?.baseline ? t('top.noBaseline') : `${t('top.baseline')} ${String(ctx.code.baseline).slice(0, 7)}`))),
        h('div', { className: 'pdv-kpis big' },
          [['block', 'var(--pdv-err)', counts.issuesBlockOpen, undefined, 'stat.block'],
            ['issues', 'var(--pdv-err)', counts.issuesOpen, counts.issues, 'stat.issuesOpen'],
            ['adj', 'var(--pdv-warn)', counts.adjustmentsOpen, counts.adjustments, 'stat.adjOpen'],
            ['closed', 'var(--pdv-ok)', counts.closed, undefined, 'stat.closed'],
            ['review', 'var(--pdv-warn)', counts.review, undefined, 'stat.review']].map(([k, c, v, of, l]) =>
            h(Kpi, { key: k, c, v, of, l: t(l), onClick: () => ctx.openList(k) }))),
        h('div', { className: 'pdv-grid2' },
          h('section', { className: 'pdv-sec' }, h('h3', null, t('sum.block'), h('span', { className: 'pdv-cnt q' }, blocking.length)),
            blocking.length ? blocking.map(q => row(q.id, q.title, arr(q.features).join(' · '))) : none,
            blocking.length ? h('button', { className: 'pdv-btn', style: { marginTop: 8 }, onClick: () => ctx.openList('block') }, t('sum.all')) : null),
          h('section', { className: 'pdv-sec' }, h('h3', null, t('sum.review'), h('span', { className: 'pdv-cnt rv' }, reviewing.length)),
            reviewing.length ? reviewing.slice(0, 8).map(x => row(x.id, x.title ?? x.name, arr(x.review.files).slice(0, 1).join(''))) : none),
          h('section', { className: 'pdv-sec' }, h('h3', null, t('sum.dist')),
            h('div', { className: 'pdv-dist' }, ['new', 'change', 'minor', 'ok', 'pending'].filter(s => statusCount(s)).map(s => h('span', { key: s, className: 'st-' + s, style: { flex: statusCount(s) / total }, title: `${t('fs.' + s)} ${statusCount(s)}` }))),
            h('div', { className: 'pdv-legend', style: { marginTop: 8 } }, ['new', 'change', 'minor', 'ok', 'pending'].map(s => h('span', { key: s, className: 'st-' + s }, h('i'), `${t('fs.' + s)} ${statusCount(s)}`))),
            h('div', { className: 'pdv-hint', style: { marginTop: 10 } }, t('sum.distNote', { n: arr(data.features).length }))),
          h('section', { className: 'pdv-sec' }, h('h3', null, t('sum.top')),
            remaining.length ? remaining.map(({ f, r }) => row(f.id, f.name, `Q ${r.qs} · A ${r.adj}`)) : none),
          h('section', { className: 'pdv-sec', style: { gridColumn: '1 / -1' } }, h('h3', null, t('sum.recent')),
            recentLog.length ? recentLog.map((l, i) => h('div', { key: i, className: 'pdv-logrow' },
              h('span', { className: 'pdv-id' }, `${t('top.rev')} ${l.rev}`), h('span', { className: 'pdv-hint' }, String(l.at ?? '').slice(0, 16).replace('T', ' ')), h('span', { className: 'pdv-badge' }, l.actor ?? ''), h('span', { className: 'ttl' }, l.summary ?? ''))) : none)))
    }

    // ------------------------------------------------------------ 共用规则
    function RulesView(ctx) {
      const { t, index } = ctx
      const feats = arr(index.data.features)
      const MARK = { ok: '✔', miss: '✖', q: '?', new: '○' }
      const rules = arr(index.data.rules).filter(g => !ctx.search || matchText(ctx, g.id, g.name, g.desc, ...Object.keys(g.uses ?? {}).flatMap(id => [id, index.byId.get(id)?.item.name])))
      // 选中焦点：规则 = 行，功能 = 列；其他类型的选中不影响本表
      const kind = ctx.selId ? index.byId.get(ctx.selId)?.kind : null
      const rowFocus = kind === 'rule' && rules.some(g => g.id === ctx.selId) ? ctx.selId : null
      const colFocus = kind === 'feature' ? ctx.selId : null
      const focusRule = rowFocus ? arr(index.data.rules).find(g => g.id === rowFocus) : null
      const colOn = f => colFocus ? colFocus === f.id : Boolean(focusRule?.uses?.[f.id])
      const rowFade = g => colFocus ? !g.uses?.[colFocus] : Boolean(rowFocus && rowFocus !== g.id)
      const colFade = f => (colFocus && colFocus !== f.id) || (focusRule && !focusRule.uses?.[f.id])
      const tally = g => Object.values(g.uses ?? {}).reduce((m, u) => { m[u] = (m[u] ?? 0) + 1; return m }, {})
      // 键盘：Enter/Space 与点击一致（再按取消），Esc 清除
      const keys = id => e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.select({ id }) } else if (e.key === 'Escape') ctx.select(null)
      }
      const mk = u => h('span', { className: 'pdv-rk rk-' + u }, MARK[u])
      const focusText = colFocus
        ? t('rules.focusFeature', { id: colFocus, name: index.byId.get(colFocus)?.item.name ?? '', n: arr(index.data.rules).filter(g => g.uses?.[colFocus]).length })
        : focusRule ? t('rules.focusRule', { id: focusRule.id, name: focusRule.name, n: Object.keys(focusRule.uses ?? {}).length }) : null
      return h(Fragment, null,
        h('div', { className: 'pdv-bar' }, ctx.searchInput,
          h('span', { className: 'pdv-legend' }, ['ok', 'miss', 'q', 'new'].map(u => h('span', { key: u }, mk(u), ' ', t('rules.mk.' + u)))),
          h('span', { className: 'pdv-spacer' }),
          focusText
            ? h('span', { className: 'pdv-focus' }, focusText, h('button', { className: 'pdv-x', 'aria-label': t('rules.clear'), title: t('rules.clear'), onClick: () => ctx.select(null) }, '×'))
            : h('span', { className: 'pdv-hint' }, t('rules.howto'))),
        h('div', { className: 'pdv-rwrap' }, h('table', { className: cx('pdv-table', 'pdv-rtable', (rowFocus || colFocus) && 'focusing') },
          h('thead', null, h('tr', null, h('th', null, t('rules.col')), feats.map(f => h('th', {
            key: f.id, title: `${f.id} ${f.name}`, tabIndex: 0, scope: 'col', role: 'button', 'aria-pressed': colFocus === f.id ? 'true' : 'false', className: cx('fh', colOn(f) && 'col-on', colFade(f) && 'fade', colFocus === f.id && 'col-sel'),
            onClick: () => ctx.select({ id: f.id }), onKeyDown: keys(f.id),
          }, h('span', { className: 'pdv-id' }, f.id), h('span', { className: 'fn' }, f.name))))),
          h('tbody', null,
            rules.map(g => {
              const c = tally(g)
              return h('tr', { key: g.id, className: cx('row', rowFocus === g.id && 'row-sel', rowFade(g) && 'fade'), tabIndex: 0, 'aria-selected': rowFocus === g.id ? 'true' : 'false', onClick: () => ctx.select({ id: g.id }), onKeyDown: keys(g.id) },
                h('td', { className: 'rn' },
                  h('div', null, h('span', { className: 'pdv-id' }, g.id), ' ', h('b', null, g.name)),
                  g.desc ? h('div', { className: 'pdv-hint desc', title: g.desc }, g.desc) : null,
                  h('div', { className: 'sum' }, t('rules.applies', { n: Object.keys(g.uses ?? {}).length }),
                    c.miss ? h('span', { className: 'bad' }, ' · ' + t('rules.missN', { n: c.miss })) : null,
                    c.q ? h('span', { className: 'warn' }, ' · ' + t('rules.qN', { n: c.q })) : null)),
                feats.map(f => { const u = g.uses?.[f.id]; return h('td', { key: f.id, className: cx('mc', colOn(f) && 'col-on'), title: u ? `${f.id} ${f.name}：${t('rules.mk.' + u)}` : undefined }, u ? mk(u) : null) }))
            }),
            !rules.length ? h('tr', null, h('td', { colSpan: feats.length + 1, className: 'pdv-hint' }, t('sum.none'))) : null))))
    }

    // ------------------------------------------------------------ 详情抽屉
    function Drawer(ctx) {
      const { t, index, sel } = ctx
      const [reason, setReason] = useState('')
      const [answer, setAnswer] = useState('')
      const [note, setNote] = useState('')
      const [busy, setBusy] = useState(false)
      const key = sel?.id ?? sel?.local?.id
      useEffect(() => { setReason(''); setAnswer(''); setNote('') }, [key])

      const run = async (ops, why) => {
        setBusy(true)
        try { await ctx.apply(ops, why) } catch (e) { ctx.notify(e.message, true) } finally { setBusy(false) }
      }
      const head = (id, title, extra) => h('div', { className: 'pdv-dh' },
        h('div', { className: 't' }, h('span', { className: 'pdv-id' }, id), ' ', title, extra ? h('div', { style: { marginTop: 4 } }, extra) : null),
        h('button', { className: 'pdv-btn ghost', onClick: ctx.onClose, title: t('drawer.close') }, '✕'))
      const kv = pairs => h('dl', { className: 'pdv-kv' }, pairs.filter(p => p[1] !== undefined && p[1] !== null && p[1] !== '' && !(Array.isArray(p[1]) && !p[1].length)).map(([k, v], i) => h(Fragment, { key: i }, h('dt', null, k), h('dd', null, v))))
      const chips = ids => h('div', null, arr(ids).map(id => h(Mini, { key: id, ctx, id, onDouble: index.byId.get(id)?.kind === 'feature' ? ctx.openCard : undefined })))
      const codeEl = c => (c ? h('div', { className: 'pdv-code' }, codeText(c)) : null)
      const quoteBtn = text => h('button', { className: 'pdv-btn', onClick: () => ctx.quote(text) }, t('drawer.quote'))
      const history = list => (arr(list).length ? h('ul', { className: 'pdv-hist' }, arr(list).slice().reverse().slice(0, 12).map((x, i) => h('li', { key: i },
        h('b', null, x.from && x.to ? `${t('p.' + x.from)} → ${t('p.' + x.to)}` : (x.op ?? '')), ' · ', shortDate(x.at), ' · ', x.actor ?? '',
        x.reason ? h('div', null, x.reason) : null, x.commit ? h('div', { className: 'pdv-code' }, x.commit) : null, x.answer ? h('div', null, x.answer) : null))) : null)
      const reviewBox = (kind, item) => (item.review?.state === 'pending' ? h('div', { className: 'pdv-review' },
        h('b', null, '⟳ ' + t('drawer.reviewTitle')),
        h('div', { className: 'pdv-code', style: { margin: '4px 0' } }, arr(item.review.files).join('\n')),
        h('textarea', { className: 'pdv-textarea', placeholder: t('drawer.reviewNote'), value: note, onChange: e => setNote(e.target.value) }),
        h('div', { className: 'pdv-actions' }, h('button', { className: 'pdv-btn', disabled: busy || !note.trim(), onClick: () => run([{ op: 'review', kind, id: item.id, note }], note) }, t('drawer.reviewOk')))) : null)

      // 卡片内局部节点
      if (sel?.local) {
        const n = sel.local, it = n.item ?? {}
        const fields = n.kind === 'rule' ? [[t('drawer.when'), it.when], [t('drawer.what'), it.what], [t('drawer.fail'), it.fail], [t('drawer.extra'), it.extra]]
          : n.kind === 'pre' ? [[t('drawer.cond'), it.cond], [t('drawer.act'), it.act], [t('drawer.msg'), it.msg], [t('drawer.extra'), it.note]]
            : n.kind === 'compat' ? [[t('drawer.impact'), it.impact], [t('drawer.need'), it.need], [t('drawer.regress'), it.regress]]
              : [[t('drawer.desc'), it.d], ['', it.tag]]
        return h('aside', { className: 'pdv-drawer ' + ({ rule: 'k-rule', compat: 'k-rule', step: 'k-feature', pre: 'k-module' }[n.kind] ?? 'k-module'), onClick: e => e.stopPropagation() },
          head(n.id, it.name ?? it.t ?? it.cond ?? ''),
          kv([...fields, [t('drawer.prdRef'), it.prd], [t('drawer.code'), codeEl(it.code)]]),
          h('div', { className: 'pdv-actions' }, quoteBtn(`${sel.fid} 卡片 ${n.id}（${it.name ?? it.t ?? it.cond ?? ''}）：`)))
      }
      const e = index.byId.get(sel.id)
      if (!e) return null
      const it = e.item
      if (e.kind === 'feature') {
        const d = index.derived
        return h('aside', { className: 'pdv-drawer k-' + e.kind, onClick: ev => ev.stopPropagation() },
          head(it.id, it.name, h('span', { className: cx('pdv-pill', 'st-' + it.status) }, t('fs.' + it.status))),
          reviewBox('feature', it),
          h('div', { className: 'pdv-actions' }, h('button', { className: 'pdv-btn pri', onClick: () => ctx.openCard(it.id) }, t('drawer.openCard')), quoteBtn(`处理功能 ${it.id}（${it.name}）：`)),
          kv([[t('card.prd'), it.prd], [t('card.now'), it.now], [t('card.todo'), it.todo],
            [t('card.issues'), d.featureQs[it.id]?.length ? chips(d.featureQs[it.id]) : null],
            [t('card.adjs'), d.featureAdj[it.id]?.length ? chips(d.featureAdj[it.id]) : null],
            [t('card.mods'), d.featureMods[it.id]?.length ? chips(d.featureMods[it.id]) : null],
            [t('card.rules'), Object.keys(d.featureRules[it.id] ?? {}).length ? chips(Object.keys(d.featureRules[it.id])) : null],
            [t('card.related'), arr(it.rel).length ? chips(it.rel) : null],
            [t('drawer.prdRef'), it.prdRef], [t('drawer.code'), codeEl(it.code)]]))
      }
      if (e.kind === 'issue') {
        const closed = index.closed(it.id)
        const act = (to, needReason, style) => h('button', {
          className: cx('pdv-btn', style), disabled: busy || (needReason && !reason.trim()),
          title: needReason && !reason.trim() ? t('act.needReason') : undefined,
          onClick: () => {
            const op = { op: 'progress', kind: 'issue', id: it.id, to, reason: reason.trim() || undefined }
            if (to === 'answered' && answer.trim()) op.answer = answer.trim()
            void run([op], reason.trim() || undefined)
          },
        }, busy ? t('drawer.saving') : t(to === 'open' ? 'act.reopen' : 'act.' + to))
        return h('aside', { className: 'pdv-drawer k-' + e.kind, onClick: ev => ev.stopPropagation() },
          head(it.id, it.title, h(Fragment, null, h('span', { className: cx('pdv-pill', 'sev-' + it.sev) }, `${it.type} · ${t('sev.' + it.sev)}`), ' ', h(Prog, { ctx, kind: 'issue', progress: it.progress }))),
          h('div', { className: 'pdv-opbox' },
            closed ? null : h('textarea', { className: 'pdv-textarea', placeholder: t('drawer.answerPh'), value: answer, onChange: ev => setAnswer(ev.target.value), style: { marginBottom: 6 } }),
            h('textarea', { className: 'pdv-textarea', placeholder: t('drawer.reason'), value: reason, onChange: ev => setReason(ev.target.value) }),
            h('div', { className: 'pdv-actions' },
              closed ? act('open', false) : h(Fragment, null, act('resolved', true, 'pri'), act('answered', false), act('wontfix', true, 'danger')),
              quoteBtn(`处理问题 ${it.id}（${it.title}）：`)),
            closed ? null : h('div', { className: 'pdv-hint' }, t('drawer.closeHint'))),
          reviewBox('issue', it),
          kv([[t('drawer.where'), it.where], [t('drawer.impact'), it.impact], [t('drawer.suggest'), it.suggest], [t('drawer.answer'), it.answer],
            [t('drawer.features'), chips(it.features)], [t('drawer.blocks'), index.derived.issueAdj[it.id]?.length ? chips(index.derived.issueAdj[it.id]) : null],
            [t('drawer.prdRef'), it.prd], [t('drawer.code'), codeEl(it.code)],
            [t('drawer.evidence'), arr(it.evidence).length ? codeEl(arr(it.evidence).map(x => `${x.path}${x.symbol ? ' · ' + x.symbol : ''}${x.lines ? ' · ' + x.lines : ''}`)) : null]]),
          h('dl', { className: 'pdv-kv' }, h('dt', null, t('drawer.history'))), history(it.history))
      }
      if (e.kind === 'adjustment') {
        const closed = index.closed(it.id)
        const act = (to, needReason, style) => h('button', {
          className: cx('pdv-btn', style), disabled: busy || (needReason && !reason.trim()),
          title: needReason && !reason.trim() ? t('act.needReason') : undefined,
          onClick: () => { void run([{ op: 'progress', kind: 'adjustment', id: it.id, to, reason: reason.trim() || undefined }], reason.trim() || undefined) },
        }, busy ? t('drawer.saving') : t(to === 'todo' ? 'act.reopen' : 'act.' + to))
        return h('aside', { className: 'pdv-drawer k-' + e.kind, onClick: ev => ev.stopPropagation() },
          head(it.id, it.title, h(Fragment, null, h('span', { className: 'pdv-pill' }, t('an.' + it.status)), ' ', h(Prog, { ctx, kind: 'adjustment', progress: it.progress }))),
          h('div', { className: 'pdv-opbox' },
            h('textarea', { className: 'pdv-textarea', placeholder: t('drawer.reason'), value: reason, onChange: ev => setReason(ev.target.value) }),
            h('div', { className: 'pdv-actions' },
              closed ? act('todo', false) : h(Fragment, null, act('done', true, 'pri'), it.progress !== 'doing' ? act('doing', false) : null, act('verified', true), act('dropped', true, 'danger')),
              quoteBtn(`处理改造 ${it.id}（${it.title}）：`)),
            closed ? null : h('div', { className: 'pdv-hint' }, t('drawer.closeHint'))),
          reviewBox('adjustment', it),
          kv([[t('drawer.now'), it.now], [t('drawer.after'), it.after],
            [t('drawer.blockedBy'), arr(it.blocked).length ? chips(it.blocked) : null],
            [t('drawer.features'), chips(it.features)],
            [t('drawer.evidence'), arr(it.evidence).length ? codeEl(arr(it.evidence).map(x => `${x.path}${x.symbol ? ' · ' + x.symbol : ''}`)) : null]]),
          h('dl', { className: 'pdv-kv' }, h('dt', null, t('drawer.history'))), history(it.history))
      }
      if (e.kind === 'rule') {
        return h('aside', { className: 'pdv-drawer k-' + e.kind, onClick: ev => ev.stopPropagation() },
          head(it.id, it.name),
          kv([[t('drawer.desc'), it.desc], [t('drawer.extra'), it.note], [t('drawer.uses'), chips(Object.keys(it.uses ?? {}))], [t('card.issues'), arr(it.q).length ? chips(it.q) : null], [t('card.adjs'), arr(it.adj).length ? chips(it.adj) : null]]),
          h('div', { className: 'pdv-actions' }, quoteBtn(`共用规则 ${it.id}（${it.name}）：`)))
      }
      return h('aside', { className: 'pdv-drawer k-' + e.kind, onClick: ev => ev.stopPropagation() },
        head(it.id, it.name, e.kind === 'module' ? h('span', { className: 'pdv-pill' }, t('need.' + it.need)) : null),
        kv([[t('drawer.desc'), it.sub], ['IO', it.io], [t('drawer.extra'), it.note], [t('drawer.features'), chips(it.features)],
          [t('card.adjs'), arr(it.adj).length ? chips(it.adj) : null], [t('card.issues'), arr(it.q).length ? chips(it.q) : null], [t('drawer.code'), codeEl(it.code)]]),
        h('div', { className: 'pdv-actions' }, quoteBtn(`${it.id}（${it.name}）：`)))
    }

    // ------------------------------------------------------------ 设置页
    function PrdSettings(props) {
      const t = useT(props.t)
      const api = props.api
      const [list, setList] = useState(null)
      const [registryFile, setRegistryFile] = useState('')
      const [msg, setMsg] = useState(null)
      const [editing, setEditing] = useState(null)
      const [form, setForm] = useState({})
      const [imp, setImp] = useState({ source: '', repo: '', branch: '' })
      const [cfg, setCfg] = useState(null)
      const [busy, setBusy] = useState(false)
      const say = (text, err) => setMsg({ text, err })
      const reload = useCallback(async () => {
        try {
          const r = await api('projects'); setList(r.projects); setRegistryFile(r.registryFile)
          const c = await api('configGet'); setCfg(c.config)
        } catch (e) { say(e.message, true) }
      }, [api])
      useEffect(() => { void reload() }, [reload])
      const guard = fn => async () => { setBusy(true); try { await fn() } catch (e) { say(e.message, true) } finally { setBusy(false) } }

      const doImport = guard(async () => {
        const source = imp.source.trim().replace(/^"|"$/g, '')
        if (!source) return
        const r = source.endsWith('.prdview.json')
          ? await api('register', { dataFile: source, repo: imp.repo.trim() || undefined })
          : await api('import', { source, repo: imp.repo.trim() || undefined, branch: imp.branch.trim() || undefined })
        say(t('set.importDone', { file: r.dataFile ?? source }))
        setImp({ source: '', repo: '', branch: '' })
        await reload()
      })
      const saveEdit = id => guard(async () => { await api('updateProject', { id, ...form }); setEditing(null); await reload(); say(t('drawer.saved')) })
      const unregister = p => guard(async () => { if (!window.confirm(t('set.confirmUnregister', { t: p.title }))) return; await api('unregister', { id: p.id }); await reload() })
      const exportOne = p => guard(async () => { const r = await api('export', { project: p.id }); say(t('toast.exported', { file: r.file })) })
      const saveCfg = guard(async () => { await api('configSet', { config: cfg }); say(t('set.saved')) })

      const sw = (k) => h('button', { type: 'button', role: 'switch', 'aria-checked': cfg?.[k] ? 'true' : 'false', className: 'pdv-switch', onClick: () => setCfg({ ...cfg, [k]: !cfg[k] }) })
      return h('div', { className: 'pdv pdvs', style: { height: 'auto' } }, h(Style),
        h('h2', null, t('set.title')), h('p', { className: 'desc' }, t('set.desc')),
        msg ? h('div', { className: cx('msg', msg.err && 'err') }, msg.text) : null,
        h('h3', null, t('set.projects')),
        list === null ? h('div', { className: 'pdv-hint' }, t('loading')) : list.length === 0 ? h('div', { className: 'card pdv-hint' }, t('set.none')) : list.map(p => h('div', { key: p.id, className: 'card' },
          h('div', { className: 'row' }, h('b', null, p.title), h('span', { className: 'pdv-id' }, p.id), !p.exists ? h('span', { className: 'pdv-badge err' }, t('set.missingFile')) : null,
            p.counts ? h('span', { className: 'pdv-hint' }, t('set.counts', { q: p.counts.issuesOpen, qt: p.counts.issues, a: p.counts.adjustmentsOpen, at: p.counts.adjustments })) : null,
            h('span', { className: 'pdv-spacer' }),
            editing === p.id ? null : h(Fragment, null,
              h('button', { className: 'pdv-btn', onClick: () => { setEditing(p.id); setForm({ title: p.title ?? '', htmlFile: p.htmlFile ?? '', repo: p.repo ?? '' }) } }, t('set.edit')),
              h('button', { className: 'pdv-btn', disabled: busy || !p.exists, onClick: exportOne(p) }, t('set.export')),
              h('button', { className: 'pdv-btn danger', disabled: busy, onClick: unregister(p) }, t('set.unregister')))),
          editing === p.id ? h('div', { style: { marginTop: 8 } },
            ['title', 'htmlFile', 'repo'].map(k => h('label', { key: k, className: 'field' }, k === 'title' ? t('top.project') : t('set.' + k),
              h('input', { className: 'pdv-input', value: form[k] ?? '', onChange: e => setForm({ ...form, [k]: e.target.value }) }))),
            h('div', { className: 'row' }, h('button', { className: 'pdv-btn pri', disabled: busy, onClick: saveEdit(p.id) }, t('set.save')), h('button', { className: 'pdv-btn', onClick: () => setEditing(null) }, t('set.cancel'))))
            : h('div', { className: 'kv' },
              h('span', null, t('set.dataFile')), h('span', { className: 'pdv-code' }, p.dataFile),
              h('span', null, t('set.htmlFile')), h('span', { className: 'pdv-code' }, p.htmlFile ?? '—'),
              h('span', null, t('set.repo')), h('span', { className: 'pdv-code' }, p.repo ?? '—'),
              h('span', null, t('set.baseline')), h('span', { className: 'pdv-code' }, p.baseline ?? '—')))),
        registryFile ? h('div', { className: 'pdv-hint' }, t('set.registryFile', { f: registryFile })) : null,
        h('h3', null, t('set.import')),
        h('div', { className: 'card' },
          h('label', { className: 'field' }, t('set.importPath'), h('input', { className: 'pdv-input', value: imp.source, onChange: e => setImp({ ...imp, source: e.target.value }) })),
          h('label', { className: 'field' }, t('set.importRepo'), h('input', { className: 'pdv-input', value: imp.repo, onChange: e => setImp({ ...imp, repo: e.target.value }) })),
          h('label', { className: 'field' }, t('set.importBranch'), h('input', { className: 'pdv-input', value: imp.branch, onChange: e => setImp({ ...imp, branch: e.target.value }) })),
          h('button', { className: 'pdv-btn pri', disabled: busy || !imp.source.trim(), onClick: doImport }, t('set.importBtn'))),
        h('h3', null, t('set.options')),
        cfg ? h('div', { className: 'card' },
          [['autoExport', 'set.autoExport', 'set.autoExportDesc'], ['guardFiles', 'set.guard', 'set.guardDesc'], ['codeChangeReminder', 'set.reminder', 'set.reminderDesc']].map(([k, l, d]) =>
            h('div', { key: k, className: 'opt' }, h('div', { className: 'tx' }, t(l), h('small', null, t(d))), sw(k))),
          h('label', { className: 'field', style: { marginTop: 8 } }, t('set.gitPath'), h('input', { className: 'pdv-input', value: cfg.gitPath ?? '', onChange: e => setCfg({ ...cfg, gitPath: e.target.value }) })),
          h('label', { className: 'field' }, t('set.viewsDir'), h('input', { className: 'pdv-input', value: cfg.viewsDir ?? '', placeholder: '.dsh/prd-views', onChange: e => setCfg({ ...cfg, viewsDir: e.target.value }) }), h('small', { className: 'pdv-hint' }, t('set.viewsDirDesc'))),
          h('label', { className: 'field' }, t('set.registryDir'), h('input', { className: 'pdv-input', value: cfg.registryDir ?? '', onChange: e => setCfg({ ...cfg, registryDir: e.target.value }) })),
          h('button', { className: 'pdv-btn pri', disabled: busy, onClick: saveCfg }, t('set.saveOptions'))) : null)
    }

    function SidebarCreation(props) {
      const t = useT(props.t)
      const { value, error } = useBinding(props.store, props.sessionId)
      return h('div', { className: 'pdv pdv-dock' }, h(Style), value
        ? h(UnboundPanel, { ...props, t, binding: value })
        : h('p', { role: error ? 'alert' : 'status' }, error ?? t('loading')))
    }

    // The host's session-scoped options row sits beside the branch control.
    // Never wrap native chat/composer or replace the single agentPreset seat.
    const HOME_ENTRY_CSS = `
.pdv-home-entry{display:inline-flex;align-items:center;gap:4px;flex:none;min-width:0}
.pdv-home-entry button{display:inline-flex;align-items:center;white-space:nowrap;height:28px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.pdv-home-entry button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.pdv-home-entry button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.pdv-home-entry [role=alert]{font-size:12px;color:var(--dsw-alias-state-error-primary);max-width:240px}`
    function HomeEntry(props) {
      const { services, sessionId } = props
      const t = useT(props.t)
      const [mounted, setMounted] = useState(() => services.sidebar.mounted.getSnapshot())
      const [pending, setPending] = useState(() => services.pending)
      const [error, setError] = useState(null)
      useEffect(() => {
        const sync = () => { setMounted(services.sidebar.mounted.getSnapshot()); setPending(services.pending) }
        const stop = services.sidebar.mounted.subscribe(sync)
        services.listeners.add(sync); sync()
        return () => { stop(); services.listeners.delete(sync) }
      }, [services])
      useEffect(() => {
        if (!pending || services.pending !== pending) return
        // Scope changes cancel old intent; never open the previously mounted session.
        if (pending !== sessionId) { services.pending = null; setPending(null); return }
        if (mounted !== sessionId) return
        services.pending = null; setPending(null)
        try {
          if (window.innerWidth < 768) throw new Error(t('home.narrow'))
          // Effects run after the rightbar's store adoption in this React commit.
          services.sidebar.openTab(VIEW_ID)
        } catch (e) { setError(e.message) }
      }, [pending, mounted, sessionId, services, t])
      const open = () => {
        setError(null)
        if (window.innerWidth < 768) { setError(t('home.narrow')); return }
        if (!sessionId) return
        services.pending = sessionId
        for (const listener of services.listeners) listener()
      }
      if (!sessionId) return null
      return h('span', { className: 'pdv-home-entry' }, h('style', null, HOME_ENTRY_CSS),
        h('button', { type: 'button', title: t(pending === sessionId ? 'home.busy' : 'home.tip'), 'aria-busy': pending === sessionId, onClick: open }, t('home.open'), pending === sessionId ? ' …' : ''),
        error ? h('span', { role: 'alert' }, error) : null)
    }

    // ------------------------------------------------------------ 注册
    return {
      inject: ['slots', 'connection', 'locale', 'sessions', 'conversation', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'prd-dev-view: dictionaries')
        const tr = ctx.locale.bind(NS)
        const connection = ctx.get('connection')
        const api = makeApi(connection.rpc)
        const store = createBindingStore(api)
        ctx.effect(() => () => store.dispose(), 'prd-dev-view: task subscriptions')
        // Session summaries exist before an agent starts; do not infer cwd from a live agent.
        const sessions = ctx.get('sessions')
        const seedSessionCwd = sessionId => {
          const cwd = sessions?.list?.getSnapshot().byId[sessionId]?.cwd
          if (typeof cwd === 'string' && cwd) store.setCwd(sessionId, cwd)
        }
        ctx.effect(() => sessions?.list?.subscribe(() => {
          const snapshot = sessions.list.getSnapshot()
          for (const sessionId of snapshot.ids) {
            const cwd = snapshot.byId[sessionId]?.cwd
            if (typeof cwd === 'string' && cwd && store.get(sessionId).cwd !== cwd) {
              store.setCwd(sessionId, cwd)
              if (store.get(sessionId).listeners.size) void store.refresh(sessionId)
            }
          }
        }) ?? (() => {}), 'prd-dev-view: cold session cwd')
        const insertDraft = sessionId => (text, explicit = true) => {
          try {
            const conversation = ctx.get('conversation')
            const sessions = ctx.get('sessions')
            const binding = sessions?.binding?.(sessionId)
            if (!conversation?.input || !binding) return 'blocked'
            const r = conversation.input.requestDraftInitialization(binding, { prompt: text, whenDraftExists: explicit ? 'append' : 'keep' })
            return r
          } catch { return 'blocked' }
        }
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: VIEW_ID,
          order: 30,
          locale: NS,
          label: () => tr('tab'),
          inject: sessionId => { seedSessionCwd(sessionId); return { api, store, sessionId, insertDraft: insertDraft(sessionId) } },
        }, PrdTab))
        const services = { sidebar: ctx.sidebarRight, pending: null, listeners: new Set() }
        ctx.effect(() => () => { services.pending = null; services.listeners.clear() }, 'prd-dev-view: home navigation')
        ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options', id: VIEW_ID + '.home', order: 10, locale: NS,
          inject: sessionId => ({ services, sessionId }),
        }, HomeEntry))
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: VIEW_ID + '.create', kind: VIEW_ID, title: () => tr('tab'), keepMounted: true,
        }), 'prd-dev-view: sidebar type')
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab', key: VIEW_ID + '.create', locale: NS,
          inject: sessionId => { seedSessionCwd(sessionId); return { api, store, sessionId, insertDraft: insertDraft(sessionId) } },
        }, SidebarCreation))
        // 会话头部右侧：选择本对话绑定的研发视图
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'prd-dev-view.binding',
          order: 5,
          locale: NS,
          inject: sessionId => { seedSessionCwd(sessionId); return { store, sessionId } },
        }, BindingPicker))
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'prd-dev-view',
          order: 95,
          locale: NS,
          label: () => tr('settings.nav'),
          inject: () => ({ api }),
        }, PrdSettings))
      },
    }
  },
})
