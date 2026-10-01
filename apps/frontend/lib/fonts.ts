import { Bricolage_Grotesque } from "next/font/google";

/** Display face for the public pages (body text uses Plus Jakarta Sans from the root layout). */
export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-bricolage",
});
