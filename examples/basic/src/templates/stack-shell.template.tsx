import type { TemplateNode } from "@relevate/katachi";

export type Props = {
  children?: TemplateNode;
};

export default function StackShell({ children }: Props) {
  return (
    <section className="mx-auto max-w-4xl space-y-6 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)]">
      {children}
    </section>
  );
}
