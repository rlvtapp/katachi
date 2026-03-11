import { If, safe } from "@relevate/katachi";
import Glyph from "./glyph.template";

export type Props = {
  href: string;
  title_html: string;
  summary_html: string;
  eyebrow_html?: string;
  icon: string;
  selected: boolean;
};

export default function ResourceTile({
  href,
  title_html,
  summary_html,
  eyebrow_html,
  icon,
  selected,
}: Props) {
  return (
    <li className="list-none" role="option" tabIndex={-1} aria-selected={selected}>
      <a
        href={href}
        className="group block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
      >
        <div className="flex items-start gap-3">
          <Glyph
            className="mt-0.5 h-5 w-5 shrink-0 text-slate-500"
            tone="slate"
            size="18"
            name={icon}
          />
          <div className="min-w-0 flex-1">
            <If test={eyebrow_html != null}>
              <div className="truncate text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                {safe(eyebrow_html)}
              </div>
            </If>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900">
              {safe(title_html)}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {safe(summary_html)}
            </p>
          </div>
        </div>
      </a>
    </li>
  );
}
