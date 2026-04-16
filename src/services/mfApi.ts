const MFAPI_BASE = 'https://api.mfapi.in';

export type MfSearchHit = {
  schemeCode: number;
  schemeName: string;
};

export type FundNavRow = { date: string; nav: string };
export type FundNavResponse = {
  meta?: { scheme_name?: string; scheme_code?: string | number };
  data?: FundNavRow[];
};

export type FundNavSnapshot = {
  currentNAV: number;
  dayChange: number;
  monthReturn: number;
  yearReturn: number;
  schemeName: string;
  schemeCode: string;
  lastUpdated: string;
};

const toNum = (v: string | undefined): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

export async function searchMutualFunds(query: string): Promise<MfSearchHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(`${MFAPI_BASE}/mf/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`MF search failed: ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  const hits: MfSearchHit[] = [];
  for (const row of data.slice(0, 15)) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const code = Number(o.schemeCode);
    const name = typeof o.schemeName === 'string' ? o.schemeName : '';
    if (!Number.isFinite(code) || !name) continue;
    hits.push({ schemeCode: code, schemeName: name });
  }
  return hits;
}

export function parseFundNavPayload(payload: FundNavResponse): FundNavSnapshot | null {
  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (!rows.length) return null;
  const currentNAV = toNum(rows[0]?.nav);
  if (!Number.isFinite(currentNAV)) return null;

  const yesterdayNAV = rows.length > 1 ? toNum(rows[1]?.nav) : NaN;
  const dayChange =
    Number.isFinite(yesterdayNAV) && yesterdayNAV !== 0
      ? ((currentNAV - yesterdayNAV) / yesterdayNAV) * 100
      : 0;

  const monthIdx = Math.min(22, rows.length - 1);
  const monthAgoNAV = toNum(rows[monthIdx]?.nav);
  const monthReturn =
    Number.isFinite(monthAgoNAV) && monthAgoNAV !== 0
      ? ((currentNAV - monthAgoNAV) / monthAgoNAV) * 100
      : 0;

  const yearIdx = Math.min(252, rows.length - 1);
  const yearAgoNAV = toNum(rows[yearIdx]?.nav);
  const yearReturn =
    Number.isFinite(yearAgoNAV) && yearAgoNAV !== 0
      ? ((currentNAV - yearAgoNAV) / yearAgoNAV) * 100
      : 0;

  const meta = payload.meta || {};
  const schemeName = typeof meta.scheme_name === 'string' ? meta.scheme_name : '';
  const schemeCode = meta.scheme_code != null ? String(meta.scheme_code) : '';

  return {
    currentNAV,
    dayChange,
    monthReturn,
    yearReturn,
    schemeName,
    schemeCode,
    lastUpdated: rows[0]?.date || '',
  };
}

export async function fetchFundNavBySchemeCode(schemeCode: number | string): Promise<FundNavSnapshot | null> {
  const res = await fetch(`${MFAPI_BASE}/mf/${encodeURIComponent(String(schemeCode))}`);
  if (!res.ok) return null;
  const payload: FundNavResponse = await res.json();
  return parseFundNavPayload(payload);
}
