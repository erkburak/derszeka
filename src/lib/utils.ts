import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sn`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR").format(Math.round(value));
}

export function formatCurrency(value: number, currency = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "USD" ? 4 : 2,
  }).format(value);
}

export function formatDate(value: string | Date, withTime = false): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function relativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat("tr-TR", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return "az önce";
}

/** Basit ve güvenli Markdown → HTML dönüşümü (AI çıktıları için). */
export function renderMarkdown(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inTable = false;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeTable = () => {
    if (inTable) {
      html.push("</tbody></table>");
      inTable = false;
    }
  };

  const inline = (text: string) =>
    text
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[KAYNAK (\d+)\]/g, '<span class="citation-chip">Kaynak $1</span>');

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      closeList();
      closeTable();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      closeTable();
      const level = Math.min(heading[1]!.length + 1, 4);
      html.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (/^[\s|:-]+$/.test(line)) continue;
      if (!inTable) {
        closeList();
        html.push("<table><tbody>");
        inTable = true;
      }
      html.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`);
      continue;
    }
    closeTable();

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inline(bullet[1]!)}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inline(ordered[1]!)}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      html.push(`<blockquote>${inline(quote[1]!)}</blockquote>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  closeTable();
  return html.join("\n");
}
