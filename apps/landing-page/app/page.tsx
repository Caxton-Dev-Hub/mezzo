import { SmoothScroll } from "@/components/SmoothScroll";
import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { Asymmetry } from "@/components/Asymmetry";
import { Flow } from "@/components/Flow";
import { Evidence } from "@/components/Evidence";
import { Arbitration } from "@/components/Arbitration";
import { Ledger } from "@/components/Ledger";
import { TrustStrip } from "@/components/TrustStrip";
import { CTA } from "@/components/CTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Nav />
      <main>
        <Hero />
        <Asymmetry />
        <Flow />
        <Evidence />
        <Arbitration />
        <Ledger />
        <TrustStrip />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
