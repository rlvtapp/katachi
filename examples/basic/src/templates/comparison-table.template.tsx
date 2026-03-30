import { For, type TemplateNode } from "@relevate/katachi";

export type Props = {
  head: TemplateNode[];
  rows: TemplateNode[][];
};

export default function ComparisonTable({ head, rows }: Props) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200">
        <thead>
          <tr>
            <For each={head} as="cell">
              <th className="bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {cell}
              </th>
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={rows} as="row">
            <tr className="odd:bg-white even:bg-slate-50/60">
              <For each={row} as="cell">
                <td className="px-4 py-3 text-sm text-slate-700">
                  {cell}
                </td>
              </For>
            </tr>
          </For>
        </tbody>
      </table>
    </div>
  );
}
