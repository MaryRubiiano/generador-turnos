/**
 * analyze_refs.js - Lee los archivos de referencia y vuelca TODOS sus detalles
 */
const ExcelJS = require("exceljs");
const path = require("path");

const DIR = "C:/Code/turnos-generator/M_Excel";

function fmt(val) {
  if (val === null || val === undefined) return "null";
  if (val instanceof Date) return `Date(${val.toISOString()})`;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

async function analyzeFile(filePath, label) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`ARCHIVO: ${label}`);
  console.log(`${"=".repeat(70)}`);
  console.log(`Hojas (${wb.worksheets.length}):`, wb.worksheets.map(s => `"${s.name}"`).join(", "));
  console.log(`creator: ${wb.creator}`);

  for (const sheet of wb.worksheets) {
    console.log(`\n--- HOJA: "${sheet.name}" ---`);
    console.log(`rowCount: ${sheet.rowCount}, columnCount: ${sheet.columnCount}`);
    console.log(`views: ${JSON.stringify(sheet.views)}`);
    console.log(`tabColor: ${JSON.stringify(sheet.properties?.tabColor)}`);

    // Column widths
    console.log("\nColumnas:");
    for (let c = 1; c <= sheet.columnCount; c++) {
      const col = sheet.getColumn(c);
      console.log(`  Col${c}: width=${col.width}, key=${col.key}`);
    }

    // Default row height
    console.log(`defaultRowHeight: ${sheet.properties?.defaultRowHeight}`);

    // Rows
    console.log("\nFilas (con datos):");
    for (let r = 1; r <= Math.min(sheet.rowCount, 60); r++) {
      const row = sheet.getRow(r);
      if (!row.hasValues && r > 1) continue;
      console.log(`\n  Fila ${r} (height=${row.height}):`);
      for (let c = 1; c <= sheet.columnCount; c++) {
        const cell = row.getCell(c);
        const v = cell.value;
        if (v === null || v === undefined) continue;

        const font = cell.font || {};
        const fill = cell.fill || {};
        const align = cell.alignment || {};
        const border = cell.border || {};

        console.log(`    C${c}: value=${fmt(v)}`);
        console.log(`         numFmt="${cell.numFmt}"`);
        console.log(`         font={name:${font.name}, size:${font.size}, bold:${font.bold}, italic:${font.italic}, color:${JSON.stringify(font.color)}}`);
        console.log(`         fill={type:${fill.type}, pattern:${fill.pattern}, fgColor:${JSON.stringify(fill.fgColor)}, bgColor:${JSON.stringify(fill.bgColor)}}`);
        console.log(`         align={h:${align.horizontal}, v:${align.vertical}, wrap:${align.wrapText}}`);
        const b = border;
        if (b.top || b.bottom || b.left || b.right) {
          console.log(`         border={top:${JSON.stringify(b.top)}, bottom:${JSON.stringify(b.bottom)}, left:${JSON.stringify(b.left)}, right:${JSON.stringify(b.right)}}`);
        }
      }
    }
  }
}

async function main() {
  await analyzeFile(
    path.join(DIR, "Formato Turnos Programados.xlsx"),
    "Formato Turnos Programados.xlsx"
  );
  await analyzeFile(
    path.join(DIR, "PLANTILLA DE PROGRAMACION TURNOS PROMETEO.xlsx"),
    "PLANTILLA DE PROGRAMACION TURNOS PROMETEO.xlsx"
  );
}

main().catch(console.error);
