import Link from "next/link";

export interface FaqItem {
  q: string;
  a: string;
}

/** Native details/summary accordion, first item open. */
export default function Faq({ title, items, id }: { title: string; items: FaqItem[]; id?: string }) {
  return (
    <section className="section" id={id} style={{ paddingTop: 0 }}>
      <div className="wrap faq">
        <div className="head">
          <h2>{title}</h2>
          <p>
            Can&apos;t find your answer? <Link href="/contact">Send us a message</Link> and we&apos;ll get back to you within one
            working day.
          </p>
        </div>
        <div className="qa">
          {items.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
