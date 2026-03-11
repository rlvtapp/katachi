export type Props = {
  label: string;
  tone: "neutral" | "accent";
};

export default function BadgeChip({ label, tone }: Props) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        tone == "neutral" && "bg-slate-100 text-slate-700",
        tone == "accent" && "bg-amber-100 text-amber-700",
      ]}
    >
      {label}
    </span>
  );
}
