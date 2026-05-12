interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * BIS MCP — Bank for International Settlements statistics (no auth)
 *
 * The "central banks' central bank" publishes data on cross-border banking,
 * FX, debt securities, monetary policy rates, payment systems, and credit.
 * SDMX 2.1 REST endpoint, free, no key.
 *
 * API: https://stats.bis.org/api-doc/v2/
 * Tools:
 * - list_curated_flows: pre-vetted dataflow refs by topic
 * - search_dataflows:   keyword search across the BIS dataflow registry
 * - fetch_dataset:      tidy rows for one dataflow (CSV-with-labels under the hood)
 */


const BASE_URL = 'https://stats.bis.org/api/v2';

interface CuratedFlow {
  flow_ref: string;
  topic: string;
  title: string;
}

const CURATED: CuratedFlow[] = [
  { flow_ref: 'BIS,WS_CBPOL_D,1.0', topic: 'rates', title: 'Central bank policy rates (daily)' },
  { flow_ref: 'BIS,WS_CBPOL,1.0', topic: 'rates', title: 'Central bank policy rates (monthly)' },
  { flow_ref: 'BIS,WS_TC,1.0', topic: 'fx', title: 'Triennial Central Bank Survey — FX/derivatives' },
  { flow_ref: 'BIS,WS_FAS,1.0', topic: 'finance', title: 'Financial accounts (FAS)' },
  { flow_ref: 'BIS,WS_LBS_D_PUB,1.0', topic: 'banking', title: 'Locational banking statistics (LBS)' },
  { flow_ref: 'BIS,WS_CBS_PUB,1.0', topic: 'banking', title: 'Consolidated banking statistics (CBS)' },
  { flow_ref: 'BIS,WS_DEBT_SEC2_PUB,1.0', topic: 'debt', title: 'Debt securities — international + domestic' },
  { flow_ref: 'BIS,WS_GLI,1.0', topic: 'credit', title: 'Global liquidity indicators' },
  { flow_ref: 'BIS,WS_TC,1.0', topic: 'fx', title: 'Triennial Central Bank Survey' },
  { flow_ref: 'BIS,WS_OTC_DERIV2,1.0', topic: 'derivatives', title: 'OTC derivatives semi-annual' },
  { flow_ref: 'BIS,WS_CREDIT_GAP,1.0', topic: 'credit', title: 'Credit-to-GDP gaps' },
  { flow_ref: 'BIS,WS_CPP,1.0', topic: 'property', title: 'Commercial property prices' },
  { flow_ref: 'BIS,WS_LONG_PP,1.0', topic: 'property', title: 'Long property prices (residential)' },
  { flow_ref: 'BIS,WS_EER_D,1.0', topic: 'fx', title: 'Effective exchange rates (daily)' },
  { flow_ref: 'BIS,WS_XRU_D,1.0', topic: 'fx', title: 'US-dollar exchange rates (daily)' },
];

const tools: McpToolExport['tools'] = [
  {
    name: 'list_curated_flows',
    description:
      'List BIS dataflow refs we have pre-vetted, grouped by topic (rates, fx, banking, debt, credit, property, derivatives, finance). Use the flow_ref with fetch_dataset. For everything else use search_dataflows or browse https://stats.bis.org.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional topic filter' },
      },
      required: [],
    },
  },
  {
    name: 'search_dataflows',
    description:
      'Search the BIS SDMX dataflow registry by keyword. Returns flow_refs ready to pass to fetch_dataset.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword (matches dataflow name)' },
        limit: { type: 'number', description: 'Max results (default 25, max 100)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_dataset',
    description:
      'Fetch tidy rows from a BIS dataflow. flow_ref examples: "BIS,WS_CBPOL_D,1.0" (daily policy rates). The key string is a dot-separated dimension filter (e.g., "D.US" — frequency.country). Use start_period / end_period like "2020", "2020-Q1", "2020-01".',
    inputSchema: {
      type: 'object',
      properties: {
        flow_ref: { type: 'string', description: 'SDMX dataflow reference' },
        key: { type: 'string', description: 'Dot-separated dimension key (empty for all)' },
        start_period: { type: 'string', description: 'Inclusive start' },
        end_period: { type: 'string', description: 'Inclusive end' },
        limit: { type: 'number', description: 'Cap rows (default 5000)' },
      },
      required: ['flow_ref'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_curated_flows':
      return listCurated(args.topic as string | undefined);
    case 'search_dataflows':
      return searchDataflows(reqStr(args, 'query', '"policy rates"'), (args.limit as number) ?? 25);
    case 'fetch_dataset':
      return fetchDataset(
        reqStr(args, 'flow_ref', '"BIS,WS_CBPOL_D,1.0"'),
        (args.key as string | undefined) ?? '',
        args.start_period as string | undefined,
        args.end_period as string | undefined,
        (args.limit as number) ?? 5000,
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

function listCurated(topic?: string) {
  const filtered = topic ? CURATED.filter((f) => f.topic === topic) : CURATED;
  return {
    count: filtered.length,
    topics: Array.from(new Set(CURATED.map((f) => f.topic))).sort(),
    flows: filtered,
    note: 'For full catalog: https://stats.bis.org or search_dataflows.',
  };
}

async function searchDataflows(query: string, limit: number) {
  const res = await fetch(`${BASE_URL}/structure/dataflow/BIS/all/latest?detail=allstubs`, {
    headers: { Accept: 'application/vnd.sdmx.structure+json;version=1.0' },
  });
  if (!res.ok) {
    throw new Error(`BIS dataflow registry error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    data?: {
      dataflows?: { id?: string; agencyID?: string; version?: string; name?: string; names?: Record<string, string> }[];
    };
  };
  const flows = data.data?.dataflows ?? [];
  const q = query.toLowerCase();
  const matched = flows.filter((f) => {
    const name = (f.name ?? f.names?.en ?? '').toLowerCase();
    return name.includes(q) || (f.id ?? '').toLowerCase().includes(q);
  });
  const capped = matched.slice(0, Math.min(100, Math.max(1, limit)));
  return {
    total_matched: matched.length,
    returned: capped.length,
    dataflows: capped.map((f) => ({
      flow_ref: `${f.agencyID ?? 'BIS'},${f.id ?? ''},${f.version ?? '1.0'}`,
      id: f.id ?? null,
      version: f.version ?? null,
      name: f.name ?? f.names?.en ?? null,
    })),
  };
}

async function fetchDataset(flowRef: string, key: string, start?: string, end?: string, limit = 5000) {
  const url = new URL(`${BASE_URL}/data/dataflow/${encodeURIComponent(flowRef)}/${key}`);
  url.searchParams.set('format', 'csvfilewithlabels');
  if (start) url.searchParams.set('startPeriod', start);
  if (end) url.searchParams.set('endPeriod', end);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`BIS data error: ${res.status} ${body.slice(0, 200)}`);
  }
  const csv = await res.text();
  const rows = parseCsv(csv);
  if (rows.length === 0) return { flow_ref: flowRef, columns: [], count: 0, rows: [] };
  const header = rows[0];
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length && out.length < limit; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === '') continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = r[c] ?? '';
    out.push(obj);
  }
  return {
    flow_ref: flowRef,
    source_url: `https://stats.bis.org/statx/srs/data/${encodeURIComponent(flowRef.split(',')[1] ?? '')}`,
    columns: header,
    truncated: rows.length - 1 > limit,
    count: out.length,
    rows: out,
  };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (ch === '\r') {
        // skip
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
