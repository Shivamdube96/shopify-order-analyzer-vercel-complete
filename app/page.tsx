import ShopifyOrderAnalyzer from "@/components/ShopifyOrderAnalyzer";
export const dynamic = "force-static"; // hobby-friendly: no serverless required
export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50">
      <ShopifyOrderAnalyzer />
    </main>
  );
}
