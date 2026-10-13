export type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
  fileName: string;
};

export function parseCsvText(text: string, fileName: string): ParsedCsv {
  const lines = splitCsvLines(text);
  if (lines.length === 0) return { headers: [], rows: [], fileName };
  const headers = lines[0].map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows = lines.slice(1).filter(line => line.some(cell => cell.trim() !== '')).map(line => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => { record[header] = (line[index] ?? '').trim(); });
    return record;
  });
  return { headers, rows, fileName };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

function splitCsvLines(text: string): string[][] {
  const records: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      current.push(field); field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      current.push(field); field = '';
      records.push(current); current = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || current.length > 0) { current.push(field); records.push(current); }
  return records;
}
