import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const inputFile = path.join(rootDir, "work", "original-consultation-export");
const outputDir = path.join(rootDir, "outputs");
const outputFile = path.join(outputDir, "gijang_consultation_applicants_2026-06-12.xlsx");

const headers = [
  "신청일",
  "상태",
  "컨설턴트",
  "장소",
  "날짜/시간",
  "거주지",
  "학부모연락처",
  "학생이름",
  "학생연락처",
  "학교명",
  "학년",
  "상담희망내용"
];

function cleanCell(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .trim();
}

function parseRows(html) {
  const rowMatches = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
  return rowMatches
    .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanCell(cell[1])).slice(0, headers.length))
    .filter((row) => row.length === headers.length);
}

function countBy(rows, index) {
  const counts = new Map();
  for (const row of rows) counts.set(row[index] || "미분류", (counts.get(row[index] || "미분류") || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

const html = await fs.readFile(inputFile, "utf8");
const rows = parseRows(html);
const summaryRows = [
  ["구분", "건수"],
  ["전체 신청", rows.length],
  ...countBy(rows, 1).map(([status, count]) => [`상태: ${status}`, count]),
  ...countBy(rows, 2).map(([consultant, count]) => [`컨설턴트: ${consultant}`, count])
];

const workbook = Workbook.create();
const summary = workbook.worksheets.add("요약");
summary.getRange(`A1:B${summaryRows.length}`).values = summaryRows;

const list = workbook.worksheets.add("상담신청자");
list.getRange(`A1:L${rows.length + 1}`).values = [headers, ...rows];

const check = await workbook.inspect({
  kind: "table",
  range: "요약!A1:B20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 4
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan"
});
console.log(errors.ndjson);

await workbook.render({ sheetName: "요약", range: "A1:B20", scale: 2 });
await workbook.render({ sheetName: "상담신청자", range: "A1:L25", scale: 1 });

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputFile);
console.log(`saved ${outputFile}`);
