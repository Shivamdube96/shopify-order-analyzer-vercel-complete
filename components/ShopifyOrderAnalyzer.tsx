"use client";
import React, { useMemo, useRef, useState, useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileUp, Search, BarChart2, RefreshCcw, UploadCloud, ShieldCheck, FileText, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid, Legend } from "recharts";

// ---- Config -----------------------------------------------------------------
const COL_KEYS = {
  order: ["name", "order name"],
  lineitem: ["lineitem name"],
  qty: ["lineitem quantity", "quantity"],
  total: ["total", "total price", "order total", "financial status total"],
  created: ["created at", "created_at", "created at (utc)", "order date", "processed at"],
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

const excelDateToJSDate = (n: number) => {
  // Excel serial to JS Date (days since 1899-12-30)
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms);
};

const parseDate = (val: any): Date | null => {
  if (val == null) return null;
  if (typeof val === "number" && val > 60 && val < 60000) {
    const d = excelDateToJSDate(val);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleString(undefined, { month: "short", year: "numeric" });

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
    .join("
");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const exportMonthlyCSV = (rows: any[], filename = "monthly_summary.csv") => {
  const header = Object.keys(rows[0] || { Month: "", "Unique Orders": "", AOV: "" });
  const csv = [header.join(",")] 
    .concat(rows.map((r) => header.map((h) => (r[h] ?? "").toString().replaceAll(",", ";")).join(",")))
    .join("
");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ---- Component ---------------------------------------------------------------
export default function ShopifyOrderAnalyzer() {
  const [rows, setRows] = useState<any[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [vizMode, setVizMode] = useState<"grouped" | "stacked">("grouped");

  const fileRef = useRef<HTMLInputElement | null>(null);

  const colMap = useMemo(() => {
    if (!cols.length) return {} as any;
    return {
      order: detectColumn(cols, COL_KEYS.order),
      lineitem: detectColumn(cols, COL_KEYS.lineitem),
      qty: detectColumn(cols, COL_KEYS.qty),
      total: detectColumn(cols, COL_KEYS.total),
      created: detectColumn(cols, COL_KEYS.created),
    } as const;
  }, [cols]);

  // ---- Drag & Drop -----------------------------------------------------------
  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setError("");
      setRunning(true);
      const data = await readFile(file);
      const columns = Object.keys(data?.[0] || {});
      setRows(data);
      setCols(columns);
      setFileName(file.name);
      setSelectedMonth("ALL");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to read file.");
    } finally {
      setRunning(false);
      setIsDragging(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const reset = () => {
    setRows([]); setCols([]); setFileName(""); setKeyword(""); setError(""); setIsDragging(false); setSelectedMonth("ALL");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ---- Order-level Summary (entire file) ------------------------------------
  const { totalOrdersInFile, shippingProtectionOrders, shippingProtectionPct } = useMemo(() => {
    if (!rows.length || !(colMap as any).order) return { totalOrdersInFile: 0, shippingProtectionOrders: 0, shippingProtectionPct: 0 };

    const orderSet = new Set<string>();
    const spOrderSet = new Set<string>();
    const lineCol = (colMap as any).lineitem;

    rows.forEach((r) => {
      const order = String(r[(colMap as any).order]);
      if (order) orderSet.add(order);
      if (lineCol) {
        const li = r[lineCol];
        if (li && normalize(li).includes("shipping protection")) spOrderSet.add(order);
      }
    });
    const total = orderSet.size;
    const sp = spOrderSet.size;
    const pct = total ? Number(((sp / total) * 100).toFixed(2)) : 0;
    return { totalOrdersInFile: total, shippingProtectionOrders: sp, shippingProtectionPct: pct };
  }, [rows, colMap]);

  // ---- Precompute order meta (total + month) --------------------------------
  const orderMeta = useMemo(() => {
    const meta = new Map<string, { total?: number | null; month?: string; monthLabel?: string }>();
    if (!rows.length || !(colMap as any).order) return meta;

    rows.forEach((r) => {
      const order = String(r[(colMap as any).order]);
      if (!order) return;
      const tot = Number(r[(colMap as any).total]);
      const createdVal = (colMap as any).created ? r[(colMap as any).created] : null;
      const d = createdVal != null ? parseDate(createdVal) : null;
      const mKey = d ? monthKey(d) : undefined;
      const mLbl = d ? monthLabel(d) : undefined;

      if (!meta.has(order)) meta.set(order, { total: !Number.isNaN(tot) ? tot : null, month: mKey, monthLabel: mLbl });
    });
    return meta;
  }, [rows, colMap]);

  // ---- Product-level analysis (ALL months) ----------------------------------
  const allMonthsAgg = useMemo(() => {
    const empty = { filteredDataset: [] as any[], qtyDistribution: [] as any[], qtyBarData: [] as any[], aov: null as number | null, totalOrders: 0 };
    if (!rows.length || !keyword || !(colMap as any).order || !(colMap as any).lineitem || !(colMap as any).qty || !(colMap as any).total) return empty;
    const k = normalize(keyword);
    const filtered = rows.filter((r) => normalize(r[(colMap as any).lineitem]).includes(k));

    const qtyByOrder = new Map<string, number>();
    const totals: number[] = [];

    filtered.forEach((r) => {
      const order = String(r[(colMap as any).order]);
      const qty = Number(r[(colMap as any).qty]);
      if (!Number.isNaN(qty)) qtyByOrder.set(order, (qtyByOrder.get(order) || 0) + qty);
    });

    Array.from(qtyByOrder.keys()).forEach((order) => {
      const meta = orderMeta.get(order);
      if (meta && typeof meta.total === "number") totals.push(meta.total);
    });

    const merged = Array.from(qtyByOrder.entries()).map(([order, q]) => ({
      "Order Name": order,
      "Total Quantity of Product": q,
      "Total Order Value": orderMeta.get(order)?.total ?? null,
    }));

    const hist = new Map<number, number>();
    merged.forEach((m) => hist.set(m["Total Quantity of Product"], (hist.get(m["Total Quantity of Product"]) || 0) + 1));

    const sortedBins = Array.from(hist.entries()).sort((a, b) => a[0] - b[0]);
    const totalCount = merged.length || 1;
    const distRows = sortedBins.map(([q, count]) => ({ "Quantity per Order": q, "Order Count": count, Percentage: Number(((count / totalCount) * 100).toFixed(2)) }));

    const aovVal = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
    const barData = distRows.map((d) => ({ qty: String(d["Quantity per Order"]), pct: d.Percentage }));

    return { filteredDataset: merged, qtyDistribution: distRows, qtyBarData: barData, aov: aovVal, totalOrders: merged.length };
  }, [rows, keyword, colMap, orderMeta]);

  // ---- Product-level analysis (per month) -----------------------------------
  const { monthOrder, monthOptions, monthlyData, monthlySummary } = useMemo(() => {
    const result: Record<string, { label: string; filteredDataset: any[]; qtyDistribution: any[]; qtyBarData: any[]; aov: number | null; totalOrders: number } > = {};
    const summaryRows: { Month: string; "Unique Orders": number; AOV: string }[] = [];
    const labels = new Map<string, string>();

    if (!rows.length || !keyword || !(colMap as any).order || !(colMap as any).lineitem || !(colMap as any).qty) return { monthOrder: [] as string[], monthOptions: [] as { key: string; label: string }[], monthlyData: result, monthlySummary: summaryRows };

    const k = normalize(keyword);

    // qty per order per month
    const qByMonthOrder = new Map<string, Map<string, number>>();

    rows.forEach((r) => {
      const li = r[(colMap as any).lineitem];
      if (!li || !normalize(li).includes(k)) return; // only matched product rows
      const order = String(r[(colMap as any).order]);
      const qty = Number(r[(colMap as any).qty]);
      const meta = orderMeta.get(order);
      const mKey = meta?.month || "Unknown";
      const mLbl = meta?.monthLabel || "Unknown";
      labels.set(mKey, mLbl);
      if (!Number.isNaN(qty)) {
        if (!qByMonthOrder.has(mKey)) qByMonthOrder.set(mKey, new Map());
        const inner = qByMonthOrder.get(mKey)!;
        inner.set(order, (inner.get(order) || 0) + qty);
      }
    });

    const sortedKeys = Array.from(qByMonthOrder.keys()).sort((a, b) => (a < b ? -1 : 1));

    sortedKeys.forEach((mKey) => {
      const inner = qByMonthOrder.get(mKey)!;
      const merged = Array.from(inner.entries()).map(([order, q]) => ({
        "Order Name": order,
        "Total Quantity of Product": q,
        "Total Order Value": orderMeta.get(order)?.total ?? null,
      }));

      const totals = merged.map((m) => Number(m["Total Order Value"])) .filter((v) => !Number.isNaN(v));
      const aovVal = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;

      const hist = new Map<number, number>();
      merged.forEach((m) => hist.set(m["Total Quantity of Product"], (hist.get(m["Total Quantity of Product"]) || 0) + 1));
      const sortedBins = Array.from(hist.entries()).sort((a, b) => a[0] - b[0]);
      const totalCount = merged.length || 1;
      const distRows = sortedBins.map(([q, count]) => ({ "Quantity per Order": q, "Order Count": count, Percentage: Number(((count / totalCount) * 100).toFixed(2)) }));
      const barData = distRows.map((d) => ({ qty: String(d["Quantity per Order"]), pct: d.Percentage }));

      result[mKey] = { label: labels.get(mKey) || mKey, filteredDataset: merged, qtyDistribution: distRows, qtyBarData: barData, aov: aovVal, totalOrders: merged.length };
      summaryRows.push({ Month: labels.get(mKey) || mKey, "Unique Orders": merged.length, AOV: `$${formatCurrency(aovVal)}` });
    });

    const options = sortedKeys.map((k) => ({ key: k, label: labels.get(k) || k }));
    return { monthOrder: sortedKeys, monthOptions: options, monthlyData: result, monthlySummary: summaryRows };
  }, [rows, keyword, colMap, orderMeta]);

  // ---- Monthly comparison data (grouped/stacked & MoM deltas) ---------------
  const { compChartData, compMonths, compMonthLabels, compQuantities, compDelta } = useMemo(() => {
    const compMonths = monthOrder;
    const compMonthLabels = compMonths.map((k) => monthlyData[k]?.label || k);
    const qSet = new Set<number>();
    compMonths.forEach((m) => (monthlyData[m]?.qtyDistribution || []).forEach((d: any) => qSet.add(d["Quantity per Order"])));
    const compQuantities = Array.from(qSet).sort((a, b) => a - b);

    const compChartData = compQuantities.map((q) => {
      const row: any = { qty: String(q) };
      compMonths.forEach((m) => {
        const arr = monthlyData[m]?.qtyDistribution || [];
        const found = arr.find((d: any) => d["Quantity per Order"] === q);
        row[m] = found ? found.Percentage : 0;
      });
      return row;
    });

    // deltas per qty per month vs previous
    const compDelta: Record<string, Record<string, number | null>> = {};
    compQuantities.forEach((q) => {
      const key = String(q);
      compDelta[key] = {} as Record<string, number | null>;
      compMonths.forEach((m, idx) => {
        const cur = compChartData.find((r) => r.qty === key)?.[m] ?? 0;
        if (idx === 0) compDelta[key][m] = null;
        else {
          const prev = compChartData.find((r) => r.qty === key)?.[compMonths[idx - 1]] ?? 0;
          compDelta[key][m] = Number((cur - prev).toFixed(2));
        }
      });
    });

    return { compChartData, compMonths, compMonthLabels, compQuantities, compDelta };
  }, [monthOrder, monthlyData]);

  // Choose dataset for display (ALL vs specific month)
  const display = selectedMonth === "ALL" ? allMonthsAgg : (monthlyData[selectedMonth] || { filteredDataset: [], qtyDistribution: [], qtyBarData: [], aov: null, totalOrders: 0 });

  // simple palette for months
  const palette = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#22c55e", "#eab308", "#f97316", "#a855f7", "#06b6d4", "#84cc16"];

  // ---- UI -------------------------------------------------------------------
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

        {/* ORDER SUMMARY (Entire file) */}
        {!!rows.length && (
          <Card className="mb-6">
            <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><FileText className="w-5 h-5"/> Order Summary (entire file)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-white">
                <FileText className="w-5 h-5" />
                <div>
                  <div className="text-neutral-500">Total orders in file</div>
                  <div className="text-lg font-semibold">{totalOrdersInFile.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-white">
                <ShieldCheck className="w-5 h-5" />
                <div>
                  <div className="text-neutral-500">Orders w/ Shipping Protection</div>
                  <div className="text-lg font-semibold">{shippingProtectionOrders.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl border bg-white">
                <ShieldCheck className="w-5 h-5" />
                <div>
                  <div className="text-neutral-500">% of orders w/ Shipping Protection</div>
                  <div className="text-lg font-semibold">{shippingProtectionPct}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* UPLOAD: Drag & Drop Dropzone */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">1) Upload your Shopify export</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition ${
                isDragging ? "bg-neutral-100 border-neutral-400" : "bg-white border-neutral-300"
              }`}
            >
              <UploadCloud className="w-8 h-8 mb-2" />
              <div className="text-sm text-neutral-700 mb-1">Drag & drop CSV/XLSX here</div>
              <div className="text-xs text-neutral-500 mb-3">or click to browse</div>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => handleFiles(e.target.files)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Upload file"
              />
              <div className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                <FileUp className="w-4 h-4" /> {fileName || "No file selected"}
              </div>
              <div className="mt-3">
                <Button variant="secondary" onClick={reset} disabled={!rows.length}>
                  <RefreshCcw className="w-4 h-4 mr-2" /> Reset
                </Button>
              </div>
            </div>
            {error && <div className="text-red-600 text-sm mt-3">{error}</div>}
          </CardContent>
        </Card>

        {/* Keyword + Month selector */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">2) Enter product text (Lineitem name contains) & choose month</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="e.g. Sima Hexagon Exfoliating Antibacterial Shower Towel"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm bg-white border rounded-xl px-3 py-2">
                  <Calendar className="w-4 h-4" />
                  <select
                    className="bg-transparent outline-none"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    disabled={!monthOptions.length}
                  >
                    <option value="ALL">All months</option>
                    {monthOptions.map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <Button disabled={!rows.length || !!error}>
                  <Search className="w-4 h-4 mr-2" /> Run
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Summary Table (for product) */}
        {!!monthlySummary.length && (
          <Card className="mb-6">
            <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5"/> Monthly Breakdown (searched product)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100">
                    <tr>
                      <th className="p-2 text-left">Month</th>
                      <th className="p-2 text-left">Unique Orders</th>
                      <th className="p-2 text-left">AOV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((r, i) => (
                      <tr key={i} className="odd:bg-white even:bg-neutral-50">
                        <td className="p-2">{r.Month}</td>
                        <td className="p-2">{r["Unique Orders"].toLocaleString()}</td>
                        <td className="p-2">{r.AOV}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={() => exportMonthlyCSV(monthlySummary, `monthly_summary_${Date.now()}.csv`)}>
                  <Download className="w-4 h-4 mr-2" /> Export Monthly CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* NEW: Monthly Distribution Comparison (Grouped/Stacked) */}
        {!!compChartData.length && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>3) Monthly Distribution Compare</span>
                <span className="inline-flex gap-2">
                  <Button variant={vizMode === "grouped" ? "default" : "secondary"} onClick={() => setVizMode("grouped")}>Grouped</Button>
                  <Button variant={vizMode === "stacked" ? "default" : "secondary"} onClick={() => setVizMode("stacked")}>Stacked</Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compChartData} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="qty" label={{ value: "Quantity per Order", position: "insideBottom", dy: 12 }} />
                    <YAxis label={{ value: "Percentage of Orders", angle: -90, position: "insideLeft" }} />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Legend />
                    {compMonths.map((m, i) => (
                      <Bar key={m} dataKey={m} name={compMonthLabels[i]} fill={palette[i % palette.length]} stackId={vizMode === "stacked" ? "all" : undefined} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* NEW: Month-wise % table with MoM change per pack */}
        {!!compChartData.length && (
          <Card className="mb-6">
            <CardHeader className="pb-2"><CardTitle className="text-lg">Monthly pack share (% of orders) & Δ vs previous month</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100">
                    <tr>
                      <th className="p-2 text-left">Qty</th>
                      {compMonths.map((m, i) => (
                        <th key={m} className="p-2 text-left">{compMonthLabels[i]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compQuantities.map((q) => {
                      const key = String(q);
                      return (
                        <tr key={key} className="odd:bg-white even:bg-neutral-50">
                          <td className="p-2 font-medium">{key}</td>
                          {compMonths.map((m, i) => {
                            const pct = compChartData.find((r) => r.qty === key)?.[m] ?? 0;
                            const delta = compDelta[key]?.[m] ?? null;
                            const up = typeof delta === "number" && delta > 0;
                            const down = typeof delta === "number" && delta < 0;
                            return (
                              <td key={m} className="p-2">
                                <div className="flex items-center gap-2">
                                  <span>{Number(pct).toFixed(2)}%</span>
                                  {i > 0 && (
                                    <span className={up ? "text-green-600" : down ? "text-red-600" : "text-neutral-500"}>
                                      {up ? <ArrowUpRight className="inline w-4 h-4"/> : down ? <ArrowDownRight className="inline w-4 h-4"/> : null}
                                      {up ? "+" : ""}{down ? "" : ""}{typeof delta === "number" ? Math.abs(delta).toFixed(2) + "%" : ""}
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results (either ALL or selected month) */}
        {!!display.filteredDataset.length ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart2 className="w-5 h-5" /> 4) Quantity per Order (% of orders)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={display.qtyBarData} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
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
                      <div><span className="text-neutral-500">Total Orders:</span> <span className="font-medium">{display.totalOrders.toLocaleString()}</span></div>
                      <div><span className="text-neutral-500">AOV:</span> <span className="font-medium">${formatCurrency(display.aov)}</span></div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-lg">Summary</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div><span className="text-neutral-500">File:</span> {fileName}</div>
                  <div><span className="text-neutral-500">Keyword:</span> {keyword}</div>
                  <div><span className="text-neutral-500">View:</span> {selectedMonth === "ALL" ? "All months" : (monthlyData[selectedMonth]?.label || selectedMonth)}</div>
                  <div><span className="text-neutral-500">Orders containing product:</span> <b>{display.totalOrders.toLocaleString()}</b></div>
                  <div><span className="text-neutral-500">AOV (incl. other items):</span> <b>${formatCurrency(display.aov)}</b></div>
                  <Button
                    className="w-full mt-3"
                    onClick={() => exportCSV(display.filteredDataset, `filtered_orders_${selectedMonth}_${Date.now()}.csv`)}
                  >
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
                        {display.filteredDataset.slice(0, 500).map((r: any, i: number) => (
                          <tr key={i} className="odd:bg-white even:bg-neutral-50">
                            <td className="p-2">{r["Order Name"]}</td>
                            <td className="p-2">{r["Total Quantity of Product"]}</td>
                            <td className="p-2">${formatCurrency(r["Total Order Value"])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {display.filteredDataset.length > 500 && (
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
                        {display.qtyDistribution.map((d: any, i: number) => (
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
