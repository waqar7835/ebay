import Link from "next/link";

export default function CtaBox({
  title,
  text,
  secondary,
}: {
  title: string;
  text: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="cta">
      <div className="wrap">
        <div className="cta-box">
          <div>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <div className="ctas">
            <Link className="btn btn-light" href="/register">
              Create your company
            </Link>
            {secondary && (
              <Link className="btn" style={{ color: "#fff", border: "1px solid rgba(255,255,255,.3)" }} href={secondary.href}>
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
