// Dev-only control gallery for auditing UI variants.
//
// This entry is NOT imported by the app, so `vite build` leaves it out. While
// `npm run electron:dev` is running, open http://localhost:5173/showcase.html
// in a browser. This is a permanent development tool: keep it in sync when a
// shared control's variants, sizes, or boundary changes.
//
// Every sample is labelled with its component / variant name; the header can
// switch theme, dark/light and zh/en so the same control can be judged against
// every accent and in both modes.

import { Component, StrictMode, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Folder,
  Inbox,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { LangProvider, useT } from "../i18n";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";
import { themes } from "../shared/themes";
import { ContextMenuProvider, useContextMenu } from "../lib/useContextMenu";
import { ToastProvider, useToast } from "../lib/toast";
import { TAG_COLORS, resolveTagColor } from "../lib/colors";
import { dateKey } from "../lib/dates";
import Button from "../components/Button";
import Badge from "../components/Badge";import GlowBadge from "../components/GlowBadge";
import { ConfidenceBadge } from "../components/growth/GrowthBadges";
import Input, { Textarea } from "../components/Input";
import NumericInput from "../components/NumericInput";
import SearchInput from "../components/SearchInput";
import TagInput from "../components/TagInput";
import SelectButton from "../components/SelectButton";
import SegmentedToggle from "../components/SegmentedToggle";
import ChipTabs from "../components/ChipTabs";
import DateField from "../components/DateField";
import DateCalendar from "../components/DateCalendar";
import ItemRow from "../components/ItemRow";
import BatchActionBar from "../components/BatchActionBar";
import SelectModeButton from "../components/SelectModeButton";
import { selectionEdgeAt } from "../lib/selectionEdge";
import NavItem from "../components/NavItem";
import SectionCard from "../components/SectionCard";
import ChallengeDetailPreview from "./ChallengeDetailPreview";
import EmptyState from "../components/EmptyState";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import PromptModal from "../components/PromptModal";
import { DropdownMenu, DropdownMenuItem, DropdownMenuDivider } from "../components/DropdownMenu";
import {
  SectionHeader,
  Select,
  SettingBlock,
  SettingRow,
  Slider,
  TextField,
  Toggle,
} from "../components/settings/controls";
import NumberInput from "../components/NumberInput";
import "../index.css";

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-section font-semibold text-primary">{title}</h2>
        {note && <p className="mt-1 text-caption text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Sample({
  name,
  description,
  children,
  className = "",
}: {
  name: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-line/60 bg-surface p-4 ${className}`}>
      <code className="text-meta text-faint">{name}</code>
      {description && <p className="mt-1 text-caption text-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "danger",
  "ghost",
  "ghost-danger",
] as const;
const BUTTON_TEXT_SIZES = ["xs", "sm"] as const;
const BUTTON_ICON_SIZES = ["icon-xs", "icon-sm"] as const;

type ShowcaseVariant = (typeof BUTTON_VARIANTS)[number];
type ShowcaseIconSize = (typeof BUTTON_ICON_SIZES)[number];

const ICON_SIZES_BY_VARIANT: Record<ShowcaseVariant, readonly ShowcaseIconSize[]> = {
  primary: [],
  secondary: [],
  danger: [],
  ghost: BUTTON_ICON_SIZES,
  "ghost-danger": ["icon-sm"],
};

// One matrix: variant label + text/icon size columns.
function ButtonGallery() {
  const [state, setState] = useState<"default" | "active" | "disabled">("default");

  return (
    <Section title="Button">
      <div className="space-y-1 text-caption text-muted">
        <p>
          文字 <code className="text-secondary">xs</code> / <code className="text-secondary">sm</code>； 图标{" "}
          <code className="text-secondary">icon-xs</code> 24px 圆形 /{" "}
          <code className="text-secondary">icon-sm</code> 32px 圆角
        </p>
        <p>
          <code className="text-secondary">❌</code> 规范不允许；{" "}
          <code className="text-secondary">active</code> 仅 ghost 生效
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-caption text-muted">状态：</span>
        <SegmentedToggle
          value={state}
          options={[
            { value: "default", label: "默认" },
            { value: "active", label: "active" },
            { value: "disabled", label: "disabled" },
          ]}
          onChange={setState}
        />
      </div>

      <Sample name="Button · 5 个型 × 4 档尺寸">
        <div className="overflow-x-auto">
          <div className="min-w-[520px] space-y-2">
            <div className="grid h-6 grid-cols-[7rem_7rem_7rem_4rem_4rem] items-center gap-3">
              <code className="text-meta text-faint">variant</code>
              {BUTTON_TEXT_SIZES.map((size) => (
                <code key={size} className="text-meta text-faint">
                  {size}
                </code>
              ))}
              {BUTTON_ICON_SIZES.map((size) => (
                <code key={size} className="text-meta text-faint">
                  {size}
                </code>
              ))}
            </div>
            {BUTTON_VARIANTS.map((variant) => (
              <div
                key={variant}
                className="grid h-10 grid-cols-[7rem_7rem_7rem_4rem_4rem] items-center gap-3"
              >
                <code className="flex h-10 items-center text-caption text-secondary">{variant}</code>
                {BUTTON_TEXT_SIZES.map((size) => (
                  <span key={size} className="flex h-10 items-center">
                    <Button
                      variant={variant}
                      size={size}
                      active={state === "active"}
                      disabled={state === "disabled"}
                      onClick={() => {}}
                    >
                      按钮
                    </Button>
                  </span>
                ))}
                {BUTTON_ICON_SIZES.map((size) => {
                  const allowed = ICON_SIZES_BY_VARIANT[variant].some((candidate) => candidate === size);
                  return (
                    <span key={size} className="flex h-10 items-center">
                      {allowed ? (
                        <Button
                          variant={variant}
                          size={size}
                          active={state === "active"}
                          disabled={state === "disabled"}
                          aria-label={`${variant} ${size}`}
                          onClick={() => {}}
                        >
                          <MoreHorizontal size={size === "icon-xs" ? 12 : 14} />
                        </Button>
                      ) : (
                        <span
                          role="img"
                          className="text-body leading-none"
                          title="规范不允许的组合"
                          aria-label="规范不允许的组合"
                        >
                          ❌
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Sample>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

const BADGE_VARIANTS = ["neutral", "outline"] as const;

function BadgeGallery() {
  return (
    <Section title="Badge">
      <div className="space-y-1 text-caption text-muted">
        <p>
          所有 Badge / GlowBadge：20px / <code className="text-secondary">text-meta</code>
        </p>
        <p>
          <code className="text-secondary">palette</code> 与 <code className="text-secondary">variant</code> 互斥；
          Badge 只读
        </p>
      </div>

      <Sample name="Badge · neutral / outline">
        <div className="flex flex-wrap items-center gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Sample>

      <Sample name="Badge · palette（身份色）">
        <div className="flex flex-wrap items-center gap-2">
          {TAG_COLORS.map((color) => (
            <Badge key={color.key} palette={color}>
              {color.key}
            </Badge>
          ))}
          <Badge palette={resolveTagColor("自动颜色")}>hash fallback</Badge>
        </div>
      </Sample>

      <Sample name="GlowBadge · accent / warning / muted">
        <div className="flex flex-wrap items-center gap-2">
          <GlowBadge intensity={0.25}>accent 0.25</GlowBadge>
          <GlowBadge intensity={0.55}>accent 0.55</GlowBadge>
          <GlowBadge tone="warning" intensity={0.2}>warning 0.2</GlowBadge>
          <GlowBadge tone="warning" intensity={0.45}>warning 0.45</GlowBadge>
          <GlowBadge muted>muted</GlowBadge>
        </div>
      </Sample>

      <Sample name="ConfidenceBadge · C0–C5">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 6 }, (_, value) => (
            <ConfidenceBadge key={value} confidence={value} />
          ))}
        </div>
      </Sample>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function InputGallery() {
  const [text, setText] = useState("");
  const [textarea, setTextarea] = useState("多行文本第一行\n第二行");
  const [search, setSearch] = useState("");
  const [integer, setInteger] = useState("42");
  const [decimal, setDecimal] = useState("3.14");
  const [negative, setNegative] = useState("-5");
  const [count, setCount] = useState<number | null>(24);
  const [emptyCount, setEmptyCount] = useState<number | null>(null);
  const [badCount, setBadCount] = useState<number | null>(9);
  const [tags, setTags] = useState(["设计", "复用"]);
  const [focusSelect, setFocusSelect] = useState("");

  return (
    <Section title="Input" note="Input / Textarea / SearchInput / NumericInput / NumberInput / TagInput；软件输入框已统一为 flat 样式。">
      <Sample name="Input · 默认 / 已填 / 禁用 / placeholder">
        <div className="grid max-w-xl gap-3">
          <Input placeholder="placeholder" value={text} onChange={(e) => setText(e.target.value)} />
          <Input value="已填写的值" readOnly />
          <Input value="禁用状态" disabled readOnly />
        </div>
      </Sample>

      <Sample name="GENESIS focus · 青色外框 + 方阵纹理">
        <div className="grid max-w-xl gap-3">
          <Input placeholder="点击聚焦 Input" value={text} onChange={(e) => setText(e.target.value)} />
          <SearchInput value={search} onChange={setSearch} wrapperClassName="w-72" placeholder="点击聚焦搜索…" />
          <SelectButton value={focusSelect} options={[{ value: "a", label: "选项 A" }, { value: "b", label: "选项 B" }]} onChange={setFocusSelect} placeholder="点击聚焦选择器" />
        </div>
        <p className="mt-2 text-caption text-muted">
          切到 GENESIS 主题后点击输入框；其他主题保持原 focus。
        </p>
      </Sample>


      <Sample name="Textarea">
        <Textarea
          value={textarea}
          onChange={(e) => setTextarea(e.target.value)}
          rows={3}
          className="w-full max-w-xl"
        />
      </Sample>

      <Sample name="SearchInput（圆角胶囊）">
        <SearchInput value={search} onChange={setSearch} wrapperClassName="w-72" placeholder="搜索…" />
      </Sample>

      <Sample name="NumericInput · 整数 / 小数 / 负数 / 后缀 / 错误态">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">整数</code>
            <NumericInput value={integer} onChange={setInteger} className="w-28" />
          </span>
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">小数</code>
            <NumericInput value={decimal} onChange={setDecimal} allowDecimal className="w-28" />
          </span>
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">负数</code>
            <NumericInput value={negative} onChange={setNegative} allowNegative className="w-28" />
          </span>
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">禁用</code>
            <NumericInput value="0" onChange={() => {}} disabled className="w-28" />
          </span>
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">后缀</code>
            <NumericInput value="30" onChange={() => {}} suffix="分钟" className="w-28" />
          </span>
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">错误态</code>
            <NumericInput value="9" onChange={() => {}} invalid suffix="1–5" className="w-28" />
          </span>
        </div>
      </Sample>

      <Sample name="NumberInput · 数字 + 边界 clamp + 后缀">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">默认</code>
            <NumberInput value={count} onChange={setCount} min={0} max={100} suffix="px" className="w-28" />
          </span>
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">空值</code>
            <NumberInput value={emptyCount} onChange={setEmptyCount} allowEmpty min={0} max={10} className="w-28" />
          </span>
          <span className="flex items-center gap-2">
            <code className="text-caption text-faint">错误态</code>
            <NumberInput value={badCount} onChange={setBadCount} invalid min={1} max={5} className="w-28" />
          </span>
        </div>
      </Sample>

      <Sample name="TagInput（建议 + 已选）">
        <TagInput
          tags={tags}
          onChange={setTags}
          suggestions={[
            { name: "工程", count: 8 },
            { name: "设计", count: 4 },
            { name: "复盘", count: 2 },
            { name: "灵感", count: 6 },
          ]}
          placeholder="添加标签"
          colorForTag={(name) => resolveTagColor(name)}
        />
      </Sample>

      <Sample name="TagInput（空槽占位）">
        <TagInput
          tags={[]}
          onChange={() => {}}
          suggestions={[
            { name: "工程", count: 8 },
            { name: "设计", count: 4 },
          ]}
          placeholder="添加标签"
          colorForTag={(name) => resolveTagColor(name)}
        />
      </Sample>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Select / segmented / chips
// ---------------------------------------------------------------------------

const FLAT_OPTIONS = [
  { value: "a", label: "选项 A" },
  { value: "b", label: "选项 B" },
  { value: "c", label: "选项 C" },
];

const GROUPED_OPTIONS = [
  { label: "领域 · 工程", options: [{ value: "code", label: "代码" }, { value: "infra", label: "基础设施" }] },
  { label: "领域 · 设计", options: [{ value: "ui", label: "界面" }, { value: "ux", label: "体验" }] },
];

const CHIP_ITEMS = [
  { key: "eng", label: "工程", meta: "8", dot: "var(--accent)" },
  { key: "design", label: "设计", meta: "4", dot: "rgb(var(--info))" },
  { key: "archived", label: "已归档", disabled: true },
];

/** 20 seasons: exercises the adaptive collapse + edge-fade overflow treatment. */
const MANY_CHIP_ITEMS = Array.from({ length: 20 }, (_, index) => ({
  key: `s${index + 1}`,
  label: `S${index + 1} · ${["春", "夏", "秋", "冬"][index % 4]}季`,
  meta: index === 19 ? "进行中" : undefined,
}));

function SelectGallery() {
  const [flat, setFlat] = useState("b");
  const [grouped, setGrouped] = useState("ui");
  const [empty, setEmpty] = useState("");
  const [segment, setSegment] = useState<"read" | "edit">("read");
  const [chip, setChip] = useState<string | null>(null);
  const [manyChip, setManyChip] = useState<string | null>(null);

  return (
    <Section title="Select · SegmentedToggle · ChipTabs" note="同一族的三种选择控件。">
      <Sample name="SelectButton · 平铺 / 分组 / emptyLabel / 禁用">
        <div className="flex flex-wrap items-start gap-4">
          <SelectButton value={flat} options={FLAT_OPTIONS} onChange={setFlat} placeholder="平铺" />
          <SelectButton value={grouped} groups={GROUPED_OPTIONS} onChange={setGrouped} placeholder="分组" />
          <SelectButton
            value={empty}
            options={FLAT_OPTIONS}
            emptyLabel="不关联"
            onChange={setEmpty}
            placeholder="emptyLabel"
          />
          <SelectButton value="a" options={[{ value: "a", label: "禁用" }]} onChange={() => {}} disabled />
        </div>
      </Sample>

      <Sample name="SelectButton · 胶囊（工具栏）">
        <div className="flex flex-wrap items-center gap-3">
          <SelectButton
            variant="pill"
            className="w-56"
            value={flat}
            options={FLAT_OPTIONS}
            onChange={setFlat}
            placeholder="胶囊下拉"
          />
          <SelectButton variant="pill" className="w-40" value="" options={FLAT_OPTIONS} onChange={() => {}} placeholder="空值" />
        </div>
        <p className="mt-2 text-caption text-muted">
          高 28px、圆角胶囊、12px 字号；用在工具栏等矮而长的位置，交互与普通 SelectButton 相同。
        </p>
      </Sample>

      <Sample name="SegmentedToggle · 纯文字 / 图标 / stretch / disabled 选项">
        <div className="flex flex-wrap items-center gap-4">
          <SegmentedToggle
            value={segment}
            options={[
              { value: "read", label: "阅读" },
              { value: "edit", label: "编辑" },
            ]}
            onChange={setSegment}
          />
          <SegmentedToggle
            value={segment}
            options={[
              { value: "read", label: "阅读", icon: BookOpen },
              { value: "edit", label: "编辑", icon: Pencil },
            ]}
            onChange={setSegment}
          />
          <SegmentedToggle
            value={segment}
            options={[
              { value: "read", label: "阅读", icon: BookOpen },
              { value: "edit", label: "编辑", icon: Pencil },
            ]}
            onChange={setSegment}
            stretch
            className="w-64"
          />
          <SegmentedToggle
            value={segment}
            options={[
              { value: "read", label: "可用" },
              { value: "edit", label: "不可用", disabled: true },
            ]}
            onChange={setSegment}
          />
        </div>
      </Sample>

      <Sample name="ChipTabs · 全部 / meta / dot / disabled / trailing">
        <ChipTabs
          items={CHIP_ITEMS}
          value={chip}
          onChange={setChip}
          allLabel="全部"
          ariaLabel="chip 示例"
          trailing={
            <Button variant="ghost" size="icon-xs" aria-label="新增">
              <Plus size={14} />
            </Button>
          }
        />
      </Sample>

      <Sample name="ChipTabs · 20 项自适应溢出（「更多」菜单）">
        <div className="max-w-[520px]">
          <ChipTabs
            items={MANY_CHIP_ITEMS}
            value={manyChip}
            onChange={setManyChip}
            collapse
            ariaLabel="溢出示例"
          />
        </div>
        <p className="mt-2 text-caption text-muted">
          按轨道宽度自动决定放几个，其余进「更多」；可见 chip 平分槽宽，拖宽窗口会多显示几个。
        </p>
      </Sample>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function DateGallery() {
  const [date, setDate] = useState(() => dateKey(new Date()));

  return (
    <Section title="Date" note="DateField 触发 Modal；DateCalendar 是共用月历本体。">
      <Sample name="DateField · 有值 / 空值（allowClear=false）">
        <div className="flex flex-wrap items-start gap-4">
          <DateField value={date} onChange={setDate} className="w-56" />
          <DateField value="" onChange={() => {}} placeholder="不设置日期" allowClear={false} className="w-56" />
        </div>
      </Sample>

      <Sample name="DateCalendar（内嵌）">
        <div className="w-72 rounded-card border border-line/60 bg-surface p-3">
          <DateCalendar value={date} onChange={setDate} />
        </div>
      </Sample>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Rows / structure / empty states
// ---------------------------------------------------------------------------

function RowGallery() {
  const [selected, setSelected] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  // Selection-run demos: the run's first/last row keeps the outer radius, middle
  // rows go square so the selected block reads as one piece.
  const runTitles = ["周会记录 2026-11-20", "Rust 所有权与借用", "SQLite WAL 机制", "阅读清单"];
  const runSelected = new Set(runTitles);
  const mixedRows = [
    { title: "已选中的行（1）", checked: true },
    { title: "未选中的行（2）", checked: false },
    { title: "已选中的行（3）", checked: true },
    { title: "未选中的行（4）", checked: false },
  ];
  const mixedKeys = mixedRows.map((row) => row.title);
  const mixedSelected = new Set(mixedRows.filter((row) => row.checked).map((row) => row.title));

  return (
    <Section title="Rows · Cards · Empty" note="ItemRow / NavItem / SectionCard / EmptyState / Skeleton / Spinner。">
      <Sample name="ItemRow · selected / 右键菜单 / 无行尾操作">
        <div className="max-w-xl space-y-1 rounded-control border border-line/60 bg-surface p-1">
          <ItemRow
            selected={selected}
            onPrimaryClick={() => setSelected((v) => !v)}
            leading={<LayoutGrid size={14} className="text-muted" />}
            title="可选中的列表行"
            meta={<span className="text-caption text-muted">12:30</span>}
            trailing={<Badge variant="outline">进行中</Badge>}
            menuItems={[
              { label: "打开", icon: <BookOpen size={14} /> },
              { label: "重命名", icon: <Pencil size={14} /> },
              { label: "删除", icon: <Trash2 size={14} />, danger: true },
            ]}
          />
          <ItemRow
            onPrimaryClick={() => {}}
            leading={<Tag size={13} className="text-muted" />}
            title="无选中的普通行"
            meta={<span className="text-caption text-faint">meta</span>}
          />
        </div>
        <p className="mt-2 text-caption text-muted">
          单击行执行主操作，右键出菜单。行尾不放任何按钮；行与行之间不加分割线，靠 hover 圆角块区分。
        </p>
      </Sample>

      <Sample name="多选 · SelectionCheck / SelectModeButton / BatchActionBar">
        <div className="max-w-xl space-y-3">
          <div className="flex items-center gap-2">
            <SelectModeButton active={selected} onToggle={() => setSelected((v) => !v)} />
            <span className="text-caption text-muted">工具栏选择开关（active = 选择中）</span>
          </div>

          <div>
            <p className="mb-1 text-caption text-muted">连续选中：4 行是一个整块（首尾圆角 + 连续左导轨）</p>
            <div className="rounded-control border border-line/60 bg-surface p-1">
              {runTitles.map((title, index) => (
                <ItemRow
                  key={title}
                  selectable
                  checked
                  selected
                  selectionEdge={selectionEdgeAt(runTitles, index, runSelected) ?? undefined}
                  title={title}
                  onPrimaryClick={() => {}}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-caption text-muted">选中 / 未选中交错（单行选中保持 8px 圆角）</p>
            <div className="rounded-control border border-line/60 bg-surface p-1">
              {mixedRows.map((row, index) => (
                <ItemRow
                  key={row.title}
                  selectable
                  checked={row.checked}
                  selected={row.checked}
                  selectionEdge={selectionEdgeAt(mixedKeys, index, mixedSelected) ?? undefined}
                  title={row.title}
                  onPrimaryClick={() => {}}
                />
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-control border border-line/60">
            <BatchActionBar
              selectedCount={2}
              actions={[
                { key: "demo", label: "批量动作", variant: "primary", onClick: () => {} },
                { key: "delete", label: "移入回收站", variant: "ghost-danger", onClick: () => {} },
              ]}
              onSelectAll={() => {}}
              onExit={() => {}}
            />
          </div>
        </div>
        <p className="mt-2 text-caption text-muted">
          选择模式：单击切换、Shift 追加区间、Ctrl/Cmd+A 全选、Esc 退出。勾选块只做展示，点击由整行/整卡承担；行间不加分割线，选中块靠 `accent-muted` 底色相连。
        </p>
      </Sample>

      <Sample name="NavItem · active / parentActive / 普通 / trailing">
        <div className="max-w-xs space-y-1">
          <NavItem active leading={<Inbox size={14} />} label="当前项（active）" trailing="12" />
          <NavItem parentActive leading={<Folder size={14} />} label="父级（parentActive）" />
          <NavItem leading={<Archive size={14} />} label="普通项" trailing="3" />
        </div>
      </Sample>

      <Sample name="SectionCard · 普通 / 可折叠 / 强调 / 色调 / 浮起">
        <div className="grid max-w-3xl gap-3 md:grid-cols-2">
          <SectionCard icon={Sparkles} title="普通卡片" count={3}>
            <div className="p-3 text-body text-secondary">body</div>
          </SectionCard>
          <SectionCard
            icon={Sparkles}
            title="可折叠卡片"
            count={3}
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
          >
            <div className="p-3 text-body text-secondary">点击标题或箭头折叠</div>
          </SectionCard>
          <SectionCard icon={Sparkles} title="强调卡片（accent）" accent>
            <div className="p-3 text-body text-secondary">accent 边框与标题色</div>
          </SectionCard>
          <SectionCard icon={Sparkles} title="色调卡片（tintColor）" tintColor={TAG_COLORS[0]}>
            <div className="p-3 text-body text-secondary">使用 tag 调色板</div>
          </SectionCard>
          <SectionCard icon={Sparkles} title="拖拽浮起（overlay）" overlay>
            <div className="p-3 text-body text-secondary">shadow-drag</div>
          </SectionCard>
        </div>
      </Sample>

      <Sample name="ChallengeDetail · 假数据 / fill">
        <ChallengeDetailPreview />
      </Sample>

      <Sample name="EmptyState · module / card / fill">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-card border border-line/60 bg-surface">
            <EmptyState
              size="module"
              icon={<Inbox size={32} className="text-faint" />}
              title="module 空态"
              description="带标题、描述与 CTA。"
              cta={{ label: "新建", onClick: () => {} }}
            />
          </div>
          <div className="rounded-card border border-line/60 bg-surface p-3">
            <EmptyState size="card" icon={<Inbox size={20} className="text-faint" />} text="card 空态" />
          </div>
          <div className="flex h-48 flex-col rounded-card border border-line/60 bg-surface">
            <EmptyState
              size="module"
              fill
              icon={<Inbox size={28} className="text-faint" />}
              title="fill 空态"
              description="撑满父容器并垂直居中。"
            />
          </div>
        </div>
      </Sample>

      <Sample name="Skeleton / SkeletonRows / Spinner">
        <div className="flex flex-wrap items-start gap-6">
          <div className="w-56 space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-10 rounded-control" />
          </div>
          <div className="w-56">
            <SkeletonRows count={3} />
          </div>
          <div className="flex items-center gap-4">
            <Spinner size={12} />
            <Spinner size={16} />
            <Spinner size={24} />
          </div>
        </div>
      </Sample>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Settings controls
// ---------------------------------------------------------------------------

function SettingsGallery() {
  const [toggle, setToggle] = useState(true);
  const [disabledToggle, setDisabledToggle] = useState(false);
  const [select, setSelect] = useState("b");
  const [text, setText] = useState("TextField 值");
  const [number, setNumber] = useState(24);
  const [slider, setSlider] = useState(60);

  return (
    <Section title="Settings controls" note="SettingRow / SettingBlock / Toggle / Select / TextField / NumberInput / Slider / SectionHeader。">
      <div className="space-y-3">
        <SectionHeader title="SectionHeader" description="分区标题与说明。" />
        <SettingRow label="Toggle" description="开关（支持 disabled）。">
          <Toggle checked={toggle} onChange={setToggle} />
        </SettingRow>
        <SettingRow label="Toggle（disabled）" description="不可用状态。">
          <Toggle checked={disabledToggle} onChange={setDisabledToggle} disabled />
        </SettingRow>
        <SettingRow label="Select" description="内部复用 SelectButton。">
          <Select value={select} options={FLAT_OPTIONS} onChange={setSelect} />
        </SettingRow>
        <SettingRow label="TextField" description="失焦或回车提交。">
          <TextField value={text} onCommit={setText} placeholder="输入…" />
        </SettingRow>
        <SettingRow label="NumberInput" description="数值字段，失焦解析并 clamp 到 min/max。">
          <NumberInput value={number} min={0} max={100} step={1} suffix="px" onChange={(v) => v !== null && setNumber(v)} />
        </SettingRow>
        <SettingBlock label="Slider" description="拖动预览，松手提交。">
          <Slider value={slider} min={0} max={100} step={1} onChange={setSlider} format={(v) => `${v}%`} />
        </SettingBlock>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function DropdownDemo() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={anchorRef} className="inline-block">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        打开菜单 <ChevronDown size={14} />
      </Button>
      <DropdownMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        <DropdownMenuItem onClick={() => setOpen(false)}>普通项</DropdownMenuItem>
        <DropdownMenuItem active onClick={() => setOpen(false)}>
          选中项（active）
        </DropdownMenuItem>
        <DropdownMenuDivider />
        <DropdownMenuItem danger onClick={() => setOpen(false)}>
          危险项（danger）
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}

function ContextMenuDemo() {
  const { onContextMenu } = useContextMenu();

  return (
    <div
      onContextMenu={(event) =>
        onContextMenu(event, [
          { label: "打开", icon: <BookOpen size={14} /> },
          { label: "重命名", icon: <Pencil size={14} /> },
          { label: "删除", icon: <Trash2 size={14} />, danger: true },
        ])
      }
      className="flex h-24 w-56 items-center justify-center rounded-card border border-dashed border-line text-caption text-muted"
    >
      在这里右键
    </div>
  );
}

function OverlayGallery() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState<"sm" | "md" | "lg">("md");
  const [modalLayout, setModalLayout] = useState<"dialog" | "document">("dialog");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const toast = useToast();

  return (
    <Section title="Overlays" note="Modal / ConfirmDialog / PromptModal / DropdownMenu / ContextMenu / Toast。">
      <Sample name="Modal · sm / md / lg / document">
        <div className="flex flex-wrap gap-3">
          {(["sm", "md", "lg"] as const).map((size) => (
            <Button
              key={size}
              variant="secondary"
              size="sm"
              onClick={() => {
                setModalLayout("dialog");
                setModalSize(size);
                setModalOpen(true);
              }}
            >
              Modal size={size}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setModalLayout("document");
              setModalOpen(true);
            }}
          >
            Modal layout=document
          </Button>
        </div>
      </Sample>

      <Sample name="ConfirmDialog · danger / default">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            danger 确认
          </Button>
        </div>
      </Sample>

      <Sample name="PromptModal">
        <Button variant="secondary" size="sm" onClick={() => setPromptOpen(true)}>
          打开 PromptModal
        </Button>
      </Sample>

      <Sample name="DropdownMenu · 普通 / active / divider / danger">
        <DropdownDemo />
      </Sample>

      <Sample name="ContextMenu · 右键触发">
        <ContextMenuDemo />
      </Sample>

      <Sample name="Toast · default / success / error / info / action">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="sm" onClick={() => toast("默认提示")}>
            默认
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast("保存成功", "success")}>
            success
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast("保存失败", "error")}>
            error
          </Button>
          <Button variant="secondary" size="sm" onClick={() => toast("提示信息", "info")}>
            info
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast("已删除", {
                type: "info",
                action: { label: "撤销", onClick: () => toast("已撤销", "default") },
              })
            }
          >
            带撤销
          </Button>
        </div>
      </Sample>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Modal · ${modalLayout === "document" ? "layout=document" : `size=${modalSize}`}`}
        icon={Sparkles}
        layout={modalLayout}
        size={modalLayout === "dialog" ? modalSize : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={() => setModalOpen(false)}>
              确定
            </Button>
          </>
        }
      >
        <p className="text-body text-secondary">这是 Modal 的内容区。按 Esc 只关闭最上层。</p>
        {modalLayout === "document" && (
          <div className="mt-4 space-y-3">
            <p className="text-body text-secondary">
              文档型容器铺满窗口（四边 64px），标题和页脚固定，只有正文滚动；适合详情和长文写作。
            </p>
            {Array.from({ length: 12 }, (_, index) => (
              <p key={index} className="text-body text-faint">
                第 {index + 1} 段占位内容，用来演示正文滚动与上下渐隐。
              </p>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        message="确认删除这条记录？该操作不可撤销。"
        title="ConfirmDialog"
        confirmLabel="删除"
        variant="danger"
        onConfirm={async () => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          toast("已删除", "success");
        }}
        onClose={() => setConfirmOpen(false)}
      />

      <PromptModal
        open={promptOpen}
        title="PromptModal"
        placeholder="输入名称"
        submitLabel="保存"
        onSubmit={(value) => {
          toast(`提交：${value}`, "success");
        }}
        onClose={() => setPromptOpen(false)}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Shell note
// ---------------------------------------------------------------------------

function ShellNote() {
  return (
    <Section title="外壳专用控件（未渲染）" note="这些控件依赖工作区/标签状态，不放进独立预览。">
      <Sample name="TabStrip / ThemeQuickMenu / ChangelogView / SplashScreen / ErrorBoundary">
        <p className="text-body text-secondary">
          外壳件只在 App 内出现：<code>TabStrip</code>、<code>ThemeQuickMenu</code>、
          <code>ChangelogView</code>、<code>SplashScreen</code>、<code>ErrorBoundary</code>。
          它们不面向功能页复用，若要看真实效果请在应用外壳中查看。
        </p>
      </Sample>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

class ShowcaseErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ControlShowcase crashed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <pre className="m-6 whitespace-pre-wrap rounded-card border border-danger/40 bg-danger/10 p-4 text-caption text-danger">
          {`ControlShowcase crashed:\n${this.state.error.stack ?? this.state.error.message}`}
        </pre>
      );
    }
    return this.props.children;
  }
}

function Showcase() {
  const { resolvedMode, setMode, themeId, setTheme } = useTheme();
  const { lang, setLang } = useT();

  const themeOptions = useMemo(
    () => themes.map((theme) => ({ value: theme.id, label: lang === "en" ? theme.nameEn : theme.name })),
    [lang],
  );

  return (
    <div className="min-h-screen bg-base text-primary">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-section font-semibold text-primary">Prism 控件预览</h1>
            <p className="text-caption text-muted">开发专用 · 不参与打包 · 标出每个控件的型名</p>
          </div>
          <SegmentedToggle
            value={lang}
            options={[
              { value: "zh", label: "中文" },
              { value: "en", label: "EN" },
            ]}
            onChange={setLang}
          />
          <Select value={themeId} options={themeOptions} onChange={setTheme} className="w-36" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMode(resolvedMode === "dark" ? "light" : "dark")}
          >
            {resolvedMode === "dark" ? "切到浅色" : "切到深色"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-12 px-6 py-8">
        <ButtonGallery />
        <BadgeGallery />
        <InputGallery />
        <SelectGallery />
        <DateGallery />
        <RowGallery />
        <SettingsGallery />
        <OverlayGallery />
        <ShellNote />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ShowcaseErrorBoundary>
      <ThemeProvider>
        <LangProvider>
          <ToastProvider>
            <ContextMenuProvider>
              <Showcase />
            </ContextMenuProvider>
          </ToastProvider>
        </LangProvider>
      </ThemeProvider>
    </ShowcaseErrorBoundary>
  </StrictMode>,
);
