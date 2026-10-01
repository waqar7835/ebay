import Link from "next/link";
import { TAGLINE } from "@/lib/brand";
import { getSiteSettings } from "@/lib/siteSettings";
import BrandLogo from "./BrandLogo";

const CURRENCIES = ["GBP", "USD", "EUR", "AUD", "CAD", "PKR"];

export default async function SiteFooter() {
  const { brandName, helloEmail } = await getSiteSettings();
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="ftop">
          <h3>Questions before you start? We reply within one working day.</h3>
          <Link className="btn" href="/contact">
            Contact us
          </Link>
        </div>
        <div className="fgrid">
          <div>
            <BrandLogo />
            <p>{TAGLINE}</p>
            {helloEmail && (
              <div className="mail">
                <small>Email us</small>
                <span>{helloEmail}</span>
              </div>
            )}
            <div className="fcur">
              {CURRENCIES.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li><Link href="/#features">Features</Link></li>
              <li><Link href="/#dashboard">Dashboard</Link></li>
              <li><Link href="/how-it-works">How it works</Link></li>
              <li><Link href="/pricing">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h5>Get started</h5>
            <ul>
              <li><Link href="/register">Create a company</Link></li>
              <li><Link href="/login">Log in</Link></li>
              <li><Link href="/forgot-password">Reset your password</Link></li>
            </ul>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li><Link href="/contact">Contact</Link></li>
              <li><Link href="/#faq">FAQ</Link></li>
            </ul>
          </div>
        </div>
        <div className="fbottom">
          <span>© {new Date().getFullYear()} {brandName}</span>
          <span>eBay is a trademark of eBay Inc. {brandName} is not affiliated with eBay.</span>
        </div>
      </div>
    </footer>
  );
}
