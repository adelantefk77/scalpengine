export function formatUsd(value: number, withSign = false): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (withSign) {
    return `${value >= 0 ? '+' : '-'}$${formatted}`;
  }
  return `${value < 0 ? '-' : ''}$${formatted}`;
}

export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '$0.00';
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 10) {
    return `$${price.toFixed(2)}`;
  }
  if (price >= 1) {
    return `$${price.toFixed(3)}`;
  }
  return `$${price.toFixed(5)}`;
}

export function formatTimeHms(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatShortDateTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (val: string | number) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
