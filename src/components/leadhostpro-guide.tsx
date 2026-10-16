import { BookOpen } from "lucide-react";
import guideData from "@/lib/marketing/leadhostpro-guide.json";
import { leadHostProBrand } from "@/lib/marketing/leadhostpro";

type GuideSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  steps?: string[];
  table?: { headers: string[]; rows: string[][] };
};
const guide: { title: string; description: string; sections: GuideSection[] } = guideData;

function GuideIndex() {
  return <ul className="space-y-1">
    {guide.sections.map((section) => <li key={section.id}>
      <a href={`#${section.id}`} className="flex min-h-11 items-center rounded px-2 py-2 text-sm leading-5 text-muted hover:bg-emerald-50 hover:text-green focus-visible:outline-2 focus-visible:outline-green">{section.title}</a>
    </li>)}
  </ul>;
}

export function LeadHostProGuide() {
  return <div className="min-w-0 max-w-6xl">
    <div className="mb-6 border-b border-slate-200 pb-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-green"><BookOpen size={18} aria-hidden="true" />{leadHostProBrand.domain}</p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{guide.description}</p>
    </div>
    <div className="grid min-w-0 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav aria-label="Indice della guida" className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-3">
          <p className="mb-3 px-2 text-sm font-semibold text-ink">Indice</p><GuideIndex />
        </nav>
      </aside>
      <div className="min-w-0">
        <details className="mb-6 border-b border-slate-200 pb-4 lg:hidden">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-green">Indice della guida</summary>
          <nav aria-label="Indice della guida"><GuideIndex /></nav>
        </details>
        <article aria-label={guide.title} className="min-w-0 space-y-8">
          {guide.sections.map((section) => <section key={section.id} aria-labelledby={section.id} className="min-w-0 border-b border-slate-200 pb-8 last:border-0">
            <h2 id={section.id} className="scroll-mt-6 text-lg font-semibold text-ink">{section.title}</h2>
            <div className="mt-4 min-w-0 space-y-4 text-sm leading-7 text-muted [overflow-wrap:anywhere]">
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets ? <ul className="list-disc space-y-2 pl-5 marker:text-green">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              {section.steps ? <ol className="list-decimal space-y-3 pl-5 marker:font-semibold marker:text-green">{section.steps.map((item) => <li key={item} className="pl-1">{item}</li>)}</ol> : null}
              {section.table ? <table className="w-full table-fixed border-collapse text-left text-sm leading-6">
                <thead className="border-b border-slate-300 bg-slate-50 text-ink"><tr>{section.table.headers.map((header) => <th key={header} scope="col" className="w-1/2 px-3 py-3 font-semibold">{header}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-200">{section.table.rows.map((row) => <tr key={row[0]}>{row.map((value, index) => <td key={index} className="px-3 py-3 align-top [overflow-wrap:anywhere]">{value}</td>)}</tr>)}</tbody>
              </table> : null}
            </div>
          </section>)}
        </article>
      </div>
    </div>
  </div>;
}
