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

/** "13:00" → "1:00 PM" */
function to12h(timeStr) {
  if (!timeStr) return "";
  const match = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return timeStr;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const suf = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${suf}`;
}

/** "13:00 - 14:00" → "1:00 pm - 2:00 pm" (formato referencia) */
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

/** Cédula como número entero */
function cedulaNum(cedula) {
  if (!cedula || cedula === "???") return "";
  const n = parseInt(String(cedula).replace(/\D/g, ""), 10);
  return isNaN(n) ? "" : n;
}

/** "YYYY-MM-DD" → Date (mediodía UTC) */
function parseFecha(fechaStr) {
  if (!fechaStr) return null;
  return new Date(fechaStr + "T12:00:00Z");
}

/** "HH:MM" → "H:MM AM/PM" limpio para splits */
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

/** Nombre del sheet Prometeo: "del X al Y de mes" */
function calcSheetName(scheduleData) {
  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const fechas = scheduleData.map((t) => t.fecha).filter(Boolean).sort();
  if (!fechas.length) return "Programacion Turnos";
  const ini = new Date(fechas[0] + "T12:00:00Z");
  const fin = new Date(fechas[fechas.length - 1] + "T12:00:00Z");
  return `del ${ini.getUTCDate()} al ${fin.getUTCDate()} de ${MESES[fin.getUTCMonth()]}`;
}

// ============================================
// CONSTANTES DE ESTILO
// ============================================

// Fuentes
const FONT_FORMATO     = { name: "Aptos Narrow", size: 11 };
const FONT_FORMATO_HDR = { name: "Aptos Narrow", size: 11, bold: true, color: { theme: 0 } }; // blanco
const FONT_PROMETEO    = { name: "Calibri", size: 11 };
const FONT_PROMETEO_HDR = { name: "Calibri", size: 11, bold: true };

// Alineaciones
const ALIGN_CENTER = { horizontal: "center", vertical: "middle" };
const ALIGN_LEFT   = { horizontal: "left" };

// Bordes (obligatorios en Formato Turnos, ausentes en Prometeo)
const THIN_BORDER = {
  top:    { style: "thin" },
  bottom: { style: "thin" },
  left:   { style: "thin" },
  right:  { style: "thin" },
};

// Fill del encabezado Formato Turnos: azul claro (theme 3 + tint 0.25)
const HDR_FILL_FORMATO = {
  type:    "pattern",
  pattern: "solid",
  fgColor: { theme: 3, tint: 0.249977111117893 },
};

// ============================================
// ARCHIVO 1: FORMATO TURNOS PROGRAMADOS
// ============================================

async function generateFormatoTurnos(scheduleData, metadata) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Generador de Turnos";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Hoja1");

  // Anchos exactos del archivo de referencia
  const columns = [
    { header: "Fecha",             width: 21.7265625  },
    { header: "Cedula",            width: 11.26953125 },
    { header: "Nombre Agente",     width: 29.1796875  },
    { header: "Campaña",           width: 15.81640625 },
    { header: "Supervisor",        width: 16.54296875 },
    { header: "Hora Inicio Turno", width: 25.7265625  },
    { header: "Hora Fin Turno",    width: 25.7265625  },
    { header: "Almuerzo",          width: 16.453125   },
  ];

  sheet.columns = columns.map((c) => ({ width: c.width }));

  // ---- ENCABEZADOS (fila 1) ----
  const headerRow = sheet.getRow(1);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value     = col.header;
    cell.font      = FONT_FORMATO_HDR;
    cell.fill      = HDR_FILL_FORMATO;   // ← azul claro, requerido por referencia
    cell.alignment = ALIGN_CENTER;
    cell.border    = THIN_BORDER;        // ← borde fino, requerido por referencia
  });

  // ---- DATOS (desde fila 2) ----
  // Ordenar por fecha (asc), luego preservar orden original entre misma fecha
  const sorted = [...scheduleData].sort((a, b) => {
    if (a.fecha < b.fecha) return -1;
    if (a.fecha > b.fecha) return 1;
    return 0;
  });

  sorted.forEach((turno, idx) => {
    const row = sheet.getRow(2 + idx);
    const isDescanso    = turno.esDescanso === true;
    const isIncapacidad = turno.esIncapacidad === true;

    const applyDataCell = (cell) => {
      cell.font   = FONT_FORMATO;
      cell.border = THIN_BORDER;  // ← borde fino en TODOS los datos
    };

    // Col 1 - Fecha
    const fechaCell = row.getCell(1);
    fechaCell.value     = parseFecha(turno.fecha);
    fechaCell.numFmt    = "mm-dd-yy";
    fechaCell.alignment = ALIGN_CENTER;
    applyDataCell(fechaCell);

    // Col 2 - Cedula
    const cedCell = row.getCell(2);
    cedCell.value     = cedulaNum(turno.cedula);
    cedCell.alignment = ALIGN_CENTER;
    applyDataCell(cedCell);

    // Col 3 - Nombre Agente (Title Case como viene de M_Excel)
    const nomCell = row.getCell(3);
    nomCell.value     = turno.nombre || "";
    nomCell.alignment = ALIGN_CENTER;
    applyDataCell(nomCell);

    // Col 4 - Campaña
    const campCell = row.getCell(4);
    campCell.value     = turno.campana || metadata?.campana || "";
    campCell.alignment = ALIGN_CENTER;
    applyDataCell(campCell);

    // Col 5 - Supervisor
    const supCell = row.getCell(5);
    supCell.value     = metadata?.supervisor || "";
    supCell.alignment = ALIGN_CENTER;
    applyDataCell(supCell);

    // Col 6 - Hora Inicio Turno
    const hiCell = row.getCell(6);
    hiCell.alignment = ALIGN_CENTER;
    applyDataCell(hiCell);

    // Col 7 - Hora Fin Turno
    const hfCell = row.getCell(7);
    hfCell.alignment = ALIGN_CENTER;
    applyDataCell(hfCell);

    // Col 8 - Almuerzo
    const almCell = row.getCell(8);
    almCell.alignment = ALIGN_CENTER;
    applyDataCell(almCell);

    if (isDescanso) {
      hiCell.value  = "Descanso";
      hfCell.value  = "Descanso";
      almCell.value = null;
    } else if (isIncapacidad) {
      const motivo = turno.motivoAusencia || "Incapacidad";
      hiCell.value  = motivo;
      hfCell.value  = motivo;
      almCell.value = null;
    } else if (turno.esSplit) {
      // Turno partido: texto "HH:MM AM - HH:MM AM" en ambas columnas
      hiCell.value  = `${toHHMM_ampm(turno.horaInicio)} - ${toHHMM_ampm(turno.horaFin)}`;
      hfCell.value  = `${toHHMM_ampm(turno.splitHoraInicio2)} - ${toHHMM_ampm(turno.splitHoraFin2)}`;
      almCell.value = null;
    } else {
      // Turno normal: Date objects con formato h:mm AM/PM
      const hiDate = timeStrToExcelDate(turno.horaInicio);
      const hfDate = timeStrToExcelDate(turno.horaFin);
      if (hiDate) { hiCell.value = hiDate; hiCell.numFmt = "h:mm AM/PM"; }
      if (hfDate) { hfCell.value = hfDate; hfCell.numFmt = "h:mm AM/PM"; }
      almCell.value = almuerzoA12h(turno.almuerzo);
    }
  });

  // Congelar fila de encabezados
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  // Altura de fila por defecto
  sheet.properties = { defaultRowHeight: 14.5 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
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

  // Anchos exactos del archivo de referencia
  const colsProg = [
    { header: "Cédula",   width: 11          },
    { header: "Nombre ",  width: 36          },
    { header: "Contrato", width: 37.26953125 },
    { header: "Jornada",  width: 25.26953125 },
    { header: "Fecha",    width: 9.7265625   },
    { header: "Lider ",   width: 27          },
  ];

  sheet.columns = colsProg.map((c) => ({ width: c.width }));

  // ---- ENCABEZADOS (fila 1) ----
  // En la referencia: Calibri bold, center h, SIN fill, SIN bordes
  const hdr = sheet.getRow(1);
  colsProg.forEach((col, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value     = col.header;
    cell.font      = FONT_PROMETEO_HDR;
    cell.alignment = { horizontal: "center" };  // sin v (como en referencia)
    // Sin fill, sin bordes (igual que referencia)
  });

  // ---- DATOS ----
  // Ordenar: por cedula/nombre (para agrupar agente), luego por fecha
  const sorted = [...scheduleData].sort((a, b) => {
    const keyA = String(a.cedula || a.nombre || "");
    const keyB = String(b.cedula || b.nombre || "");
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    return (a.fecha || "").localeCompare(b.fecha || "");
  });

  sorted.forEach((turno, idx) => {
    const row = sheet.getRow(2 + idx);

    // Calcular jornada
    let jornada = turno.jornada || "";
    if (turno.esDescanso) {
      jornada = "DESCANSO";
    } else if (turno.esIncapacidad) {
      jornada = turno.motivoAusencia?.toUpperCase() || "INCAPACIDAD";
    }

    // C1 - Cédula: Calibri 11 explícito, alineación LEFT (como referencia)
    const cedCell = row.getCell(1);
    cedCell.value     = cedulaNum(turno.cedula);
    cedCell.font      = FONT_PROMETEO;
    cedCell.alignment = ALIGN_LEFT;

    // C2 - Nombre: SIN font explícito (hereda Calibri default), SIN alineación
    // (En la referencia font=undefined para estas celdas)
    const nomCell = row.getCell(2);
    nomCell.value = turno._nombreCompleto || (turno.nombre || "").toUpperCase();

    // C3 - Contrato: SIN font explícito
    const conCell = row.getCell(3);
    conCell.value = turno.contrato || metadata?.contrato || "";

    // C4 - Jornada: SIN font explícito
    const jorCell = row.getCell(4);
    jorCell.value = jornada;

    // C5 - Fecha: Calibri 11 explícito, numFmt mm-dd-yy, SIN alineación
    const fechaCell = row.getCell(5);
    fechaCell.value  = parseFecha(turno.fecha);
    fechaCell.numFmt = "mm-dd-yy";
    fechaCell.font   = FONT_PROMETEO;

    // C6 - Lider: SIN font explícito (como referencia)
    const lidCell = row.getCell(6);
    lidCell.value = (metadata?.lider || metadata?.supervisor || "").toUpperCase();
  });

  // Congelar fila de encabezados
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  sheet.properties = { defaultRowHeight: 14.5 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { generateFormatoTurnos, generatePlantillaPrometeo };
