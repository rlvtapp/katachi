import { If, type TemplateNode } from "@relevate/katachi";

export type Props = {
  eyebrow?: string;
  caption_html?: TemplateNode;
  children?: TemplateNode;
};

export default function MediaFrame({ eyebrow, caption_html, children }: Props) {
  return (
    <figure className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <If test={eyebrow != null}>
        <div className="border-b border-slate-200 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
          {eyebrow}
        </div>
      </If>
      <div className="bg-slate-50 p-4">{children}</div>
      <If test={caption_html != null}>
        <figcaption className="border-t border-slate-200 px-5 py-4 text-sm leading-6 text-slate-600">
          {caption_html}
        </figcaption>
      </If>
    </figure>
  );
}
