import type { TemplateNode } from "@relevate/katachi";

export type Props = {
  label: string;
  children?: TemplateNode;
};

export default function HoverNote({ label, children }: Props) {
  return (
    <span
      data-hover-note={label}
      className="cursor-help underline decoration-dotted underline-offset-4"
    >
      {children}
    </span>
  );
}
