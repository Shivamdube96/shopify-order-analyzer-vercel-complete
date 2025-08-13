"use client";
import React, { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileUp, Search, BarChart2, RefreshCcw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid } from "recharts";

const COL_KEYS = {
  order: ["name", "order name"],
  lineitem: ["lineitem name"],
  qty: ["lineitem quantity", "quantity"],
  total: ["total", "total price", "order total", "financial status total"],
};
const normalize = (s: any) => String(s ?? "").trim().toLowerCase();
const detectColumn = (columns: string[], candidates: string[]) => {
  const norm = columns.map((c) => normalize(c));
  for (const cand of candidates) {
    const idx = norm.indexOf(normalize(cand));
    if (idx !== -1) return columns[idx];
  }
  for (const c of columns) if (candidates.some((cand) => normalize(c).includes(normalize(cand)))) return c;
  return null;
};

const readFile = (file: File) =>
  new Promise<any[]>((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv") {
      Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data as any[]), error: reject });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error("Unsupported file type. Upload CSV or XLSX."));
    }
  });

const formatCurrency = (n?: number | null) => (n == null || Number.isNaN(Number(n)) ? "–" : Number(n).toFixed(2));

const exportCSV = (rows: any[], filename = "filtered_orders.csv") => {
  const header = Object.keys(rows[0] || { "Order Name": "", "Total Quantity of Product": "", "Total Order Value": "" });
  const csv = [header.join(",")]
    .concat(rows.map((r) => header.map((h) => (r[h] ?? "").toString().replaceAll(",", ";")).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function ShopifyOrderAnalyzer() {
  const [rows, setRows] = useState<any[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const colMap = useMemo(() => {
    if (!cols.length) return {} as any;
    return {
      order: detectColumn(cols, COL_KEYS.order),
      lineitem: detectColumn(cols, COL_KEYS.lineitem),
      qty: detectColumn(cols, COL_KEYS.qty),
      total: detectColumn(cols, COL_KEYS.total),
    } as const;
  }, [cols]);

  const productNames = useMemo(() => {
    if (!rows.length || !(colMap as any).lineitem) return [] as string[];
    const set = new Set<string>();
    rows.forEach((r) => {
      const v = r[(colMap as any).lineitem];
      if (v) set.add(String(v));
    });
    return Array.from(set).sort();
  }, [rows, colMap]);

  const onFile = async (file: File) => {
    try {
      setError("");
      setRunning(true);
      const data = await readFile(file);
      const columns = Object.keys(data?.[0] || {});
      setRows(data);
      setCols(columns);
      setFileName(file.name);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to read file.");
    } finally {
      setRunning(false);
    }
  };

  const { filteredDataset, qtyDistribution, qtyBarData, aov, totalOrders } = useMemo(() => {
    const empty = { filteredDataset: [] as any[], qtyDistribution: [] as any[], qtyBarData: [] as any[], aov: null as number | null, totalOrders: 0 };
    if (!rows.length || !keyword || !(colMap as any).order || !(colMap as any).lineitem || !(colMap as any).qty || !(colMap as any).total) return empty;

    const k = normalize(keyword);
    const filtered = rows.filter((r) => normalize(r[(colMap as any).lineitem]).includes(k));

    const qtyByOrder = new Map<string, number>();
    const totalByOrder = new Map<string, number>();

    rows.forEach((r) => {
      const order = String(r[(colMap as any).order]);
      const tot = Number(r[(colMap as any).total]);
      if (!totalByOrder.has(order) && !Number.isNaN(tot)) totalByOrder.set(order, tot);
    });

    filtered.forEach((r) => {
      const order = String(r[(colMap as any).order]);
      const qty = Number(r[(colMap as any).qty]);
      if (!Number.isNaN(qty)) qtyByOrder.set(order, (qtyByOrder.get(order) || 0) + qty);
    });

    const merged = Array.from(qtyByOrder.entries()).map(([order, q]) => ({
      "Order Name": order,
      "Total Quantity of Product": q,
      "Total Order Value": totalByOrder.get(order) ?? null,
    }));

    const hist = new Map<number, number>();
    merged.forEach((m) => hist.set(m["Total Quantity of Product"], (hist.get(m["Total Quantity of Product"]) || 0) + 1));

    const sortedBins = Array.from(hist.entries()).sort((a, b) => a[0] - b[0]);
    const totalCount = merged.length || 1;
    const distRows = sortedBins.map(([q, count]) => ({ "Quantity per Order": q, "Order Count": count, Percentage: Number(((count / totalCount) * 100).toFixed(2)) }));

    const validTotals = merged.map((m) => Number(m["Total Order Value"])).filter((v) => !Number.isNaN(v));
    const aovVal = validTotals.length ? validTotals.reduce((a, b) => a + b, 0) / validTotals.length : null;

    const barData = distRows.map((d) => ({ qty: String(d["Quantity per Order"]), pct: d.Percentage }));

    return { filteredDataset: merged, qtyDistribution: distRows, qtyBarData: barData, aov: aovVal, totalOrders: merged.length };
  }, [rows, keyword, colMap]);

  const reset = () => {
    setRows([]); setCols([]); setFileName(""); setKeyword(""); setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="min-h-screen w-full bg-neutral-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Shopify Order Analyzer</h1>
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <Badge>Client‑side only</Badge>
            <Badge>CSV/XLSX</Badge>
            <Badge>Percent labels + AOV</Badge>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">1) Upload your Shopify export</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="sm:w-auto" />
            <Button variant="secondary" onClick={reset} disabled={!rows.length}>
              <RefreshCcw className="w-4 h-4 mr-2" /> Reset
            </Button>
            <div className="text-sm text-neutral-600 flex items-center gap-2">
              <FileUp className="w-4 h-4" /> {fileName || "No file selected"}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">2) Enter product text (Lineitem name contains)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input placeholder="e.g. Sima Hexagon Exfoliating Antibacterial Shower Towel" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              <Button disabled={!rows.length || !!error}>
                <Search className="w-4 h-4 mr-2" /> Run
              </Button>
            </div>
            {!!productNames.length && (
              <div className="text-xs text-neutral-600">Tip: starts-with your keyword to narrow. {productNames.length.toLocaleString()} variants found in file.</div>
            )}
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </CardContent>
        </Card>

        {!!filteredDataset.length ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart2 className="w-5 h-5" /> 3) Quantity per Order (% of orders)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={qtyBarData} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="qty" label={{ value: "Quantity per Order", position: "insideBottom", dy: 12 }} />
                        <YAxis label={{ value: "Percentage of Orders", angle: -90, position: "insideLeft" }} />
                        <Tooltip formatter={(v: any) => `${v}%`} />
                        <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                          <LabelList dataKey="pct" position="top" formatter={(v: any) => `${v}%`} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <div className="text-right text-sm bg-white/80 shadow px-3 py-2 rounded-xl">
                      <div><span className="text-neutral-500">Total Orders:</span> <span className="font-medium">{totalOrders.toLocaleString()}</span></div>
                      <div><span className="text-neutral-500">AOV:</span> <span className="font-medium">${formatCurrency(aov)}</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-lg">Summary</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><span className="text-neutral-500">File:</span> {fileName}</div>
                  <div><span className="text-neutral-500">Keyword:</span> {keyword}</div>
                  <div><span className="text-neutral-500">Orders containing product:</span> <b>{totalOrders.toLocaleString()}</b></div>
                  <div><span className="text-neutral-500">AOV (incl. other items):</span> <b>${formatCurrency(aov)}</b></div>
                  <Button className="w-full mt-3" onClick={() => exportCSV(filteredDataset, `filtered_orders_${Date.now()}.csv`)}>
                    <Download className="w-4 h-4 mr-2" /> Export CSV
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-lg">Filtered Dataset</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-100">
                        <tr>
                          <th className="p-2 text-left">Order Name</th>
                          <th className="p-2 text-left">Total Quantity of Product</th>
                          <th className="p-2 text-left">Total Order Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDataset.slice(0, 500).map((r: any, i: number) => (
                          <tr key={i} className="odd:bg-white even:bg-neutral-50">
                            <td className="p-2">{r["Order Name"]}</td>
                            <td className="p-2">{r["Total Quantity of Product"]}</td>
                            <td className="p-2">${formatCurrency(r["Total Order Value"])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredDataset.length > 500 && (
                      <div className="p-3 text-xs text-neutral-500">Showing first 500 rows… export CSV for full data.</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-lg">Quantity Distribution</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-auto rounded-xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-100">
                        <tr>
                          <th className="p-2 text-left">Quantity per Order</th>
                          <th className="p-2 text-left">Order Count</th>
                          <th className="p-2 text-left">Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qtyDistribution.map((d: any, i: number) => (
                          <tr key={i} className="odd:bg-white even:bg-neutral-50">
                            <td className="p-2">{d["Quantity per Order"]}</td>
                            <td className="p-2">{d["Order Count"].toLocaleString()}</td>
                            <td className="p-2">{d["Percentage"]}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-neutral-500">
              <div className="flex items-center justify-center gap-2 mb-2"><BarChart2 className="w-5 h-5"/>No report yet</div>
              <div>Upload a file and enter a product keyword to generate the same report & chart you use today.</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
