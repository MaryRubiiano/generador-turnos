const ExcelJS = require("exceljs");

// ============================================
// HELPERS
// ============================================

function timeStrToExcelDate(timeStr) {
  if (!timeStr || timeStr === "null") return null;
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  return new Date(Date.UTC(1899, 11, 30, h, m, 0));
}

function toPrometeoTime(timeStr) {
  if (!timeStr) return "";
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const isPM = h >= 12;
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suf = isPM ? "p. m." : "a. m.";
  return `${h12}:${String(m).padStart(2, "0")}:00 ${suf}`;
}

function buildJornadaPrometeo(turno) {
  if (turno.esDescanso) return "Descanso";
  if (turno.esIncapacidad) return (turno.motivoAusencia || "INCAPACIDAD").toUpperCase();
  if (turno.esSplit) {
    const m1 = toPrometeoTime(turno.horaInicio);
    const m2 = toPrometeoTime(turno.horaFin);
    const t1 = toPrometeoTime(turno.splitHoraInicio2);
    const t2 = toPrometeoTime(turno.splitHoraFin2);
    return `${m1} - ${m2} // ${t1} - ${t2}`;
  }
  const inicio = toPrometeoTime(turno.horaInicio);
  const fin    = toPrometeoTime(turno.horaFin);
  if (!inicio || !fin) return turno.jornada || "";
  return `${inicio} - ${fin}`;
}

function almuerzoA12h(almuerzoStr) {
  if (!almuerzoStr || almuerzoStr === "null" || almuerzoStr === "n/a") return null;
  if (!/\d/.test(String(almuerzoStr))) return null;
  const match = String(almuerzoStr).match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h1 = parseInt(match[1]), m1 = parseInt(match[2]);
  const h2 = parseInt(match[3]), m2 = parseInt(match[4]);
  const fmt = (h, m) => {
    const suf = h >= 12 ? "pm" : "am";
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${suf}`;
  };
  return `${fmt(h1, m1)} - ${fmt(h2, m2)}`;
}

function cedulaNum(cedula) {
  if (!cedula || cedula === "???") return "";
  const n = parseInt(String(cedula).replace(/\D/g, ""), 10);
  return isNaN(n) ? "" : n;
}

function parseFecha(fechaStr) {
  if (!fechaStr) return null;
  return new Date(fechaStr + "T12:00:00Z");
}

function toHHMM_ampm(timeStr) {
  if (!timeStr) return "";
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const suf = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suf}`;
}

function calcSheetName(scheduleData) {
  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const fechas = scheduleData.map((t) => t.fecha).filter(Boolean).sort();
  if (!fechas.length) return "Programacion Turnos";
  const ini = new Date(fechas[0] + "T12:00:00Z");
  const fin = new Date(fechas[fechas.length - 1] + "T12:00:00Z");
  return `del ${ini.getUTCDate()} al ${fin.getUTCDate()} de ${MESES[fin.getUTCMonth()]}`;
}

// ============================================
// ESTILOS
// ============================================

const ALIGN_CENTER = { horizontal: "center", vertical: "middle", wrapText: false };
const ALIGN_LEFT   = { horizontal: "left",   vertical: "middle", wrapText: false };
const ALIGN_RIGHT  = { horizontal: "right",  vertical: "middle", wrapText: false };

const THIN_BORDER = {
  top:    { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  left:   { style: "thin", color: { argb: "FFB0B0B0" } },
  right:  { style: "thin", color: { argb: "FFB0B0B0" } },
};

const FONT_FORMATO      = { name: "Aptos Narrow", size: 10 };
const FONT_FORMATO_HDR  = { name: "Aptos Narrow", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
const FONT_PROMETEO     = { name: "Calibri", size: 10 };
const FONT_PROMETEO_HDR = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };

const HDR_FILL_FORMATO  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };
const HDR_FILL_PROMETEO = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
const ROW_FILL_ODD      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
const ROW_FILL_EVEN     = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F7FC" } };
const FILL_DESCANSO     = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
const FILL_SPLIT        = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
const FILL_INCAPACIDAD  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } };

// ============================================
// ARCHIVO 1: FORMATO TURNOS PROGRAMADOS
// ============================================

async function generateFormatoTurnos(scheduleData, metadata) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Generador de Turnos";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Turnos Programados");

  const columns = [
    { header: "Fecha",             width: 14 },
    { header: "Cédula",            width: 14 },
    { header: "Nombre Agente",     width: 32 },
    { header: "Campaña",           width: 18 },
    { header: "Supervisor",        width: 24 },
    { header: "Hora Inicio Turno", width: 28 },
    { header: "Hora Fin Turno",    width: 34 },
    { header: "Almuerzo",          width: 18 },
  ];

  sheet.columns = columns.map((c) => ({ width: c.width }));
  sheet.getRow(1).height = 22;

  // Encabezados
  const headerRow = sheet.getRow(1);
  columns.forEach((col, i) => {
    const cell     = headerRow.getCell(i + 1);
    cell.value     = col.header;
    cell.font      = FONT_FORMATO_HDR;
    cell.fill      = HDR_FILL_FORMATO;
    cell.alignment = ALIGN_CENTER;
    cell.border    = THIN_BORDER;
  });

  // Datos
  const sorted = [...scheduleData].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  sorted.forEach((turno, idx) => {
    const row = sheet.getRow(2 + idx);
    row.height = 18;

    const isDescanso    = turno.esDescanso === true;
    const isIncapacidad = turno.esIncapacidad === true;
    const isSplit       = turno.esSplit === true;

    let rowFill = idx % 2 === 0 ? ROW_FILL_ODD : ROW_FILL_EVEN;
    if (isDescanso)    rowFill = FILL_DESCANSO;
    if (isSplit)       rowFill = FILL_SPLIT;
    if (isIncapacidad) rowFill = FILL_INCAPACIDAD;

    const applyCell = (cell, align = ALIGN_CENTER) => {
      cell.font = FONT_FORMATO; cell.border = THIN_BORDER;
      cell.fill = rowFill;      cell.alignment = align;
    };

    const fechaCell = row.getCell(1);
    fechaCell.value = parseFecha(turno.fecha); fechaCell.numFmt = "dd/mm/yyyy";
    applyCell(fechaCell);

    const cedCell = row.getCell(2);
    cedCell.value = cedulaNum(turno.cedula);
    applyCell(cedCell);

    const nomCell = row.getCell(3);
    nomCell.value = turno.nombre || "";
    applyCell(nomCell, ALIGN_LEFT);

    const campCell = row.getCell(4);
    campCell.value = turno.campana || metadata?.campana || "";
    applyCell(campCell);

    const supCell = row.getCell(5);
    supCell.value = metadata?.supervisor || "";
    applyCell(supCell);

    const hiCell  = row.getCell(6); applyCell(hiCell);
    const hfCell  = row.getCell(7); applyCell(hfCell);
    const almCell = row.getCell(8); applyCell(almCell);

    if (isDescanso) {
      hiCell.value  = "Descanso"; hiCell.font  = { ...FONT_FORMATO, color: { argb: "FF375623" }, italic: true };
      hfCell.value  = "Descanso"; hfCell.font  = { ...FONT_FORMATO, color: { argb: "FF375623" }, italic: true };
      almCell.value = null;
    } else if (isIncapacidad) {
      const motivo  = turno.motivoAusencia || "Incapacidad";
      hiCell.value  = motivo; hiCell.font  = { ...FONT_FORMATO, color: { argb: "FFC00000" }, bold: true };
      hfCell.value  = motivo; hfCell.font  = { ...FONT_FORMATO, color: { argb: "FFC00000" }, bold: true };
      almCell.value = null;
    } else if (isSplit) {
      hiCell.value  = `${toHHMM_ampm(turno.horaInicio)} - ${toHHMM_ampm(turno.horaFin)}`;
      hfCell.value  = `${toHHMM_ampm(turno.splitHoraInicio2)} - ${toHHMM_ampm(turno.splitHoraFin2)}`;
      hiCell.font   = { ...FONT_FORMATO, color: { argb: "FF7F6000" }, bold: true };
      hfCell.font   = { ...FONT_FORMATO, color: { argb: "FF7F6000" }, bold: true };
      almCell.value = null;
    } else {
      const hiDate = timeStrToExcelDate(turno.horaInicio);
      const hfDate = timeStrToExcelDate(turno.horaFin);
      if (hiDate) { hiCell.value = hiDate; hiCell.numFmt = "h:mm AM/PM"; }
      if (hfDate) { hfCell.value = hfDate; hfCell.numFmt = "h:mm AM/PM"; }
      almCell.value = almuerzoA12h(turno.almuerzo);
    }
  });

  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  sheet.properties = { defaultRowHeight: 18 };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ============================================
// ARCHIVO 2: PLANTILLA PROMETEO
// ============================================

async function generatePlantillaPrometeo(scheduleData, metadata) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Generador de Turnos";
  workbook.created = new Date();

  const sheetName = calcSheetName(scheduleData);
  const sheet = workbook.addWorksheet(sheetName);

  const colsProg = [
    { header: "Cédula",   width: 14 },
    { header: "Nombre",   width: 34 },
    { header: "Contrato", width: 38 },
    { header: "Jornada",  width: 44 },
    { header: "Fecha",    width: 13 },
    { header: "Líder",    width: 28 },
  ];

  sheet.columns = colsProg.map((c) => ({ width: c.width }));
  sheet.getRow(1).height = 22;

  // Encabezados
  const hdr = sheet.getRow(1);
  colsProg.forEach((col, i) => {
    const cell     = hdr.getCell(i + 1);
    cell.value     = col.header;
    cell.font      = FONT_PROMETEO_HDR;
    cell.fill      = HDR_FILL_PROMETEO;
    cell.alignment = ALIGN_CENTER;
    cell.border    = THIN_BORDER;
  });

  // Datos
  const sorted = [...scheduleData].sort((a, b) => {
    const kA = String(a.cedula || a.nombre || "");
    const kB = String(b.cedula || b.nombre || "");
    if (kA < kB) return -1; if (kA > kB) return 1;
    return (a.fecha || "").localeCompare(b.fecha || "");
  });

  sorted.forEach((turno, idx) => {
    const row  = sheet.getRow(2 + idx);
    row.height = 18;

    const isDescanso    = turno.esDescanso === true;
    const isIncapacidad = turno.esIncapacidad === true;
    const isSplit       = turno.esSplit === true;
    const jornada       = buildJornadaPrometeo(turno);

    let rowFill = idx % 2 === 0 ? ROW_FILL_ODD : ROW_FILL_EVEN;
    if (isDescanso)    rowFill = FILL_DESCANSO;
    if (isSplit)       rowFill = FILL_SPLIT;
    if (isIncapacidad) rowFill = FILL_INCAPACIDAD;

    const applyCell = (cell, align = ALIGN_CENTER) => {
      cell.font = FONT_PROMETEO; cell.fill = rowFill;
      cell.alignment = align;   cell.border = THIN_BORDER;
    };

    const cedCell = row.getCell(1);
    cedCell.value = cedulaNum(turno.cedula);
    applyCell(cedCell, ALIGN_RIGHT);

    const nomCell = row.getCell(2);
    nomCell.value = turno._nombreCompleto || (turno.nombre || "").toUpperCase();
    applyCell(nomCell, ALIGN_LEFT);

    const conCell = row.getCell(3);
    conCell.value = turno.contrato || metadata?.contrato || "";
    applyCell(conCell, ALIGN_LEFT);

    const jorCell = row.getCell(4);
    jorCell.value = jornada;
    applyCell(jorCell, ALIGN_CENTER);
    if (isDescanso)    jorCell.font = { ...FONT_PROMETEO, color: { argb: "FF375623" }, italic: true };
    if (isIncapacidad) jorCell.font = { ...FONT_PROMETEO, color: { argb: "FFC00000" }, bold: true };
    if (isSplit)       jorCell.font = { ...FONT_PROMETEO, color: { argb: "FF7F6000" }, bold: true };

    const fechaCell = row.getCell(5);
    fechaCell.value  = parseFecha(turno.fecha);
    fechaCell.numFmt = "dd/mm/yyyy";
    applyCell(fechaCell);

    const lidCell = row.getCell(6);
    lidCell.value = (metadata?.lider || metadata?.supervisor || "").toUpperCase();
    applyCell(lidCell, ALIGN_LEFT);
  });

  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  sheet.properties = { defaultRowHeight: 18 };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsProg.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { generateFormatoTurnos, generatePlantillaPrometeo };