import { If, type TemplateNode } from "@relevate/katachi";
import Glyph from "./glyph.template";

export type Props = {
  tone: "calm" | "urgent" | "success";
  title: string;
  icon: string;
  children?: TemplateNode;
};

export default function NoticePanel({ tone, title, icon, children }: Props) {
  return (
    <aside
      className={[
        "rounded-3xl border px-5 py-4 backdrop-blur-sm",
        tone == "calm" && "border-sky-200 bg-sky-50/80",
        tone == "urgent" && "border-rose-200 bg-rose-50/80",
        tone == "success" && "border-emerald-200 bg-emerald-50/80",
      ]}
    >
      <div className="flex items-start gap-3">
        <Glyph
          className="mt-0.5 h-5 w-5 shrink-0"
          tone={tone}
          size="18"
          name={icon}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <div className="mt-2 text-sm leading-6 text-slate-700">{children}</div>
        </div>
      </div>
      <If test={tone == "urgent"}>
        <p className="mt-3 text-xs font-medium uppercase tracking-[0.24em] text-rose-700">
          Action recommended
        </p>
      </If>
    </aside>
  );
}
