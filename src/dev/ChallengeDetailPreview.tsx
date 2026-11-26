import { useState } from "react";
import Button from "../components/Button";
import GrowthChallengeDetail from "../components/growth/GrowthChallengeDetail";
import type {
  GrowthArtifact,
  GrowthChallenge,
  GrowthPrediction,
  GrowthTask,
} from "../shared/models";

const CHALLENGE: GrowthChallenge = {
  id: 9001,
  capabilityId: 501,
  capabilityName: "系统设计",
  seasonId: null,
  seasonTitle: "第 4 季 · 深水区",
  title: "把养成模块的详情页重构成可扫读的文档面板",
  description:
    "把能力、挑战、作品三类详情从“长表单”改成可以长时间停留的文档面板：左侧读内容，右侧看证据，标题和页脚始终固定。",
  goal:
    "在不牺牲信息密度的前提下，让详情页在 900–1920 宽度下都能成立：双栏时每个区域填满高度，单栏时允许整页滚动；所有局部列表都有自己的滚动条。",
  criteria:
    "能力详情在 1440 下不出现整页滚动\n挑战详情右侧任务 / 预测 / 作品三张卡填满高度\n所有列表用普通滚动条，只有整个弹窗正文用渐隐\n编辑 / 校准 / 结算等动作不随内容滚走",
  reflection:
    "“填满”不是把每个元素都拉满，而是让每个区域承担自己的滚动职责：页面不滚、列表滚；宽屏不滚、窄屏才滚。",
  body:
    "## 重构范围\n\n- `Modal`：两种 layout 都固定标题和页脚，正文滚动带渐隐。\n- 能力详情：概览卡 + 定义卡 + 四张列表卡。\n- 挑战详情：概览卡 + 内容卡 + 任务 / 预测 / 作品卡。\n\n## 验收口径\n\n1. 1920 下没有大面积空白；\n2. 1440 下左右两栏高度一致；\n3. 900 下退成单栏且页面可滚；\n4. 所有内部列表都能独立滚到底。\n\n> 这是一个用于视觉验收的假数据挑战，不会写入数据库。",
  difficultyLevel: 4,
  status: "open",
  attribution: null,
  resultNote: "",
  resolvedOn: null,
  createdAt: "2026-10-01T08:00:00Z",
};

function task(
  id: number,
  title: string,
  scheduledDate: string,
  dueDate: string,
  completedAt: string | null,
  notes = "",
): GrowthTask {
  return {
    id,
    title,
    notes,
    capability: { id: 501, name: "系统设计" },
    challenge: { id: CHALLENGE.id, title: CHALLENGE.title },
    scheduledDate,
    dueDate,
    completedAt,
    createdAt: "2026-10-02T08:00:00Z",
  };
}

const TASKS: GrowthTask[] = [
  task(9101, "盘点现有详情页的滚动与卡片职责", "2026-11-18", "2026-11-19", null, "记录每个页面现在由谁滚"),
  task(9102, "把 Modal 改成固定头尾 + 正文滚动", "2026-11-19", "2026-11-20", null),
  task(9103, "能力详情改成概览 + 四张列表卡", "2026-11-20", "2026-11-22", null),
  task(9104, "挑战详情接入概览卡和证据卡", "2026-11-21", "2026-11-23", null),
  task(9105, "补一组假数据做长内容压测", "2026-11-22", "2026-11-24", null),
  task(9106, "检查 900 / 1440 / 1920 三档", "2026-11-24", "2026-11-26", null),
  task(9107, "确认设计守则中的滚动分工", "2026-11-15", "2026-11-16", "2026-11-16T09:00:00Z"),
  task(9108, "抽 SectionCard 的 tintColor 用法", "2026-11-16", "2026-11-17", "2026-11-17T10:00:00Z"),
  task(9109, "删除页面私有 ListCard", "2026-11-17", "2026-11-18", "2026-11-18T11:00:00Z"),
];

const PREDICTIONS: GrowthPrediction[] = [
  {
    id: 9201,
    kind: "time",
    subject: "把挑战详情拆成三张证据卡",
    predicted: 90,
    actual: null,
    predictedOn: "2026-11-23",
    note: "含空态和滚动",
    capability: { id: 501, name: "系统设计" },
    challenge: { id: CHALLENGE.id, title: CHALLENGE.title },
    task: null,
    createdAt: "2026-11-23T08:00:00Z",
  },
  {
    id: 9202,
    kind: "difficulty",
    subject: "1920 下左栏内容卡不出现空白",
    predicted: 3,
    actual: null,
    predictedOn: "2026-11-24",
    note: "用 flex-1 压测",
    capability: { id: 501, name: "系统设计" },
    challenge: { id: CHALLENGE.id, title: CHALLENGE.title },
    task: null,
    createdAt: "2026-11-24T08:00:00Z",
  },
  {
    id: 9203,
    kind: "time",
    subject: "Modal 固定头尾改造",
    predicted: 60,
    actual: 75,
    predictedOn: "2026-11-19",
    note: "实际多花了 15 分钟处理 flex 高度",
    capability: { id: 501, name: "系统设计" },
    challenge: { id: CHALLENGE.id, title: CHALLENGE.title },
    task: null,
    createdAt: "2026-11-19T08:00:00Z",
  },
  {
    id: 9204,
    kind: "mood",
    subject: "假数据压测后的手感",
    predicted: 1,
    actual: 0,
    predictedOn: "2026-11-25",
    note: "比预期稳",
    capability: { id: 501, name: "系统设计" },
    challenge: { id: CHALLENGE.id, title: CHALLENGE.title },
    task: null,
    createdAt: "2026-11-25T08:00:00Z",
  },
];

const ARTIFACTS: GrowthArtifact[] = [
  {
    id: 9301,
    capabilityId: 501,
    capabilityName: "系统设计",
    challengeId: CHALLENGE.id,
    title: "文档型面板布局规范",
    kind: "doc",
    url: "",
    note: "固定头尾、正文渐隐、列表普通滚动条的完整约定。",
    body: "## 约定\n\n- 整页滚动：渐隐 + 隐藏滚动条\n- 单组件滚动：普通滚动条\n- 双栏填满高度，单栏允许整页滚动",
    cover: "",
    images: [],
    createdOn: "2026-11-22",
    createdAt: "2026-11-22T08:00:00Z",
  },
  {
    id: 9302,
    capabilityId: 501,
    capabilityName: "系统设计",
    challengeId: CHALLENGE.id,
    title: "能力详情重构前后对比",
    kind: "demo",
    url: "",
    note: "四个列表从裸 section 换成 SectionCard，header 用 tintColor。",
    body: "一句话：卡片负责分组，列表负责滚动，页面不再滚。",
    cover: "",
    images: [],
    createdOn: "2026-11-24",
    createdAt: "2026-11-24T08:00:00Z",
  },
  {
    id: 9303,
    capabilityId: 501,
    capabilityName: "系统设计",
    challengeId: CHALLENGE.id,
    title: "长内容压测记录",
    kind: "other",
    url: "",
    note: "在 900 / 1440 / 1920 三档下检查空白和滚动。",
    body: "1920 下右栏三张卡填满；1440 下左栏内容卡出现内滚；900 下整页滚动。",
    cover: "",
    images: [],
    createdOn: "2026-11-26",
    createdAt: "2026-11-26T08:00:00Z",
  },
];

/** Dev-only fixture for visually checking the document panel without touching the DB. */
export default function ChallengeDetailPreview() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        打开挑战详情（假数据）
      </Button>
      <GrowthChallengeDetail
        open={open}
        challenge={CHALLENGE}
        artifacts={ARTIFACTS}
        tasks={TASKS}
        predictions={PREDICTIONS}
        onClose={() => setOpen(false)}
        onEdit={() => {}}
        onResolve={() => {}}
        onOpenArtifact={() => {}}
        onOpenTask={() => {}}
        onDeleteTask={() => {}}
        onNewTask={() => {}}
        onPredictTask={() => {}}
        onNewPrediction={() => {}}
        onSettlePrediction={() => {}}
        onTaskToggled={() => {}}
        onOpenCapability={() => {}}
        onUpdated={() => {}}
        onChanged={() => {}}
      />
    </>
  );
}
