type WorkspacePlaceholderProps = {
  title: string;
  description: string;
  items: string[];
};

export function WorkspacePlaceholder({
  title,
  description,
  items,
}: WorkspacePlaceholderProps) {
  return (
    <section>
      <div className="border-b border-ink/10 pb-6">
        <h2 className="text-2xl font-semibold text-ink">{title}</h2>
        <p className="mt-2 max-w-2xl leading-7 text-muted">{description}</p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="card p-4">
            <p className="font-medium text-ink">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
