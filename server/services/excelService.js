const ExcelJS = require("exceljs");

// ============================================
// HELPERS
// ============================================

function calcularHoras(inicio, fin) {
  if (!inicio || !fin) return 0;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  const totalMin = h2 * 60 + m2 - (h1 * 60 + m1);
  return totalMin > 0 ? totalMin / 60 : 0;
}

function formatHora(hora) {
  if (!hora || hora === "null") return "";
  return hora;
}

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1B52F5" },
};
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Arial" };
const BORDER = {
  top: { style: "thin", color: { argb: "FFD0D5E2" } },
  left: { style: "thin", color: { argb: "FFD0D5E2" } },
  bottom: { style: "thin", color: { argb: "FFD0D5E2" } },
  right: { style: "thin", color: { argb: "FFD0D5E2" } },
};
const DATA_FONT = { size: 10, name: "Arial" };

// ============================================
// ARCHIVO 1: FORMATO TURNOS PROGRAMADOS
// ============================================

async function generateFormatoTurnos(scheduleData, metadata) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Generador de Turnos";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Turnos Programados", {
    pageSetup: { fitToPage: true, fitToWidth: 1 },
  });

  // ---- COLUMNAS ----
  const columns = [
    { header: "Fecha",        key: "fecha",      width: 14 },
    { header: "Cedula",       key: "cedula",     width: 16 },
    { header: "Nombre Agente",key: "nombre",     width: 30 },
    { header: "Campana",      key: "campana",    width: 20 },
    { header: "Supervisor",   key: "supervisor", width: 22 },
    { header: "Hora Inicio",  key: "horaInicio", width: 13 },
    { header: "Hora Fin",     key: "horaFin",    width: 13 },
    { header: "Almuerzo",     key: "almuerzo",   width: 20 },
    { header: "Jornada",      key: "jornada",    width: 28 },
    { header: "Observacion",  key: "obs",        width: 20 },
  ];

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  // ---- ENCABEZADO (fila 1) ----
  const headerRow = sheet.getRow(1);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  });
  headerRow.height = 22;

  // ---- DATOS (desde fila 2) ----
  const sorted = [...scheduleData].sort((a, b) => {
    if (a.fecha < b.fecha) return -1;
    if (a.fecha > b.fecha) return 1;
    return (a.nombre || "").localeCompare(b.nombre || "");
  });

  sorted.forEach((turno, idx) => {
    const row = sheet.getRow(2 + idx);
    const isDescanso = turno.esDescanso;
    const isIncapacidad = turno.esIncapacidad;

    let obs = "";
    if (isDescanso) obs = "DESCANSO";
    else if (isIncapacidad) obs = turno.motivoAusencia || "INCAPACIDAD";

    const horaInicio = isDescanso || isIncapacidad ? "" : formatHora(turno.horaInicio);
    const horaFin    = isDescanso || isIncapacidad ? "" : formatHora(turno.horaFin);
    let almuerzo     = isDescanso || isIncapacidad ? "" : (turno.almuerzo || "");
    if (turno.esSplit) almuerzo = "";

    row.values = [
      turno.fecha || "",
      turno.cedula || "",
      turno.nombre || "",
      turno.campana || metadata?.campana || "",
      metadata?.supervisor || "",
      horaInicio,
      horaFin,
      almuerzo,
      turno.jornada || obs,
      obs,
    ];

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = BORDER;
      cell.alignment = { vertical: "middle", horizontal: colNumber <= 3 ? "left" : "center" };
      cell.font = DATA_FONT;
    });

    row.height = 18;
  });

  // ---- FREEZE + AUTOFILTER ----
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

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

  // ---- HOJA 1: PROGRAMACION ----
  const sheetProg = workbook.addWorksheet("Programacion Turnos");

  const colsProg = [
    { header: "Cedula",        key: "cedula",   width: 16 },
    { header: "Nombre Agente", key: "nombre",   width: 30 },
    { header: "Contrato",      key: "contrato", width: 30 },
    { header: "Jornada",       key: "jornada",  width: 30 },
    { header: "Fecha",         key: "fecha",    width: 14 },
    { header: "Dia",           key: "dia",      width: 12 },
    { header: "Lider",         key: "lider",    width: 22 },
    { header: "Estado",        key: "estado",   width: 18 },
  ];

  sheetProg.columns = colsProg.map((c) => ({ key: c.key, width: c.width }));

  const hdr1 = sheetProg.getRow(1);
  colsProg.forEach((col, i) => {
    const cell = hdr1.getCell(i + 1);
    cell.value = col.header;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  });
  hdr1.height = 22;

  const sorted = [...scheduleData].sort((a, b) => {
    const n = (a.nombre || "").localeCompare(b.nombre || "");
    if (n !== 0) return n;
    return (a.fecha || "").localeCompare(b.fecha || "");
  });

  sorted.forEach((turno, idx) => {
    const row = sheetProg.getRow(2 + idx);

    let estado = "Trabajando";
    if (turno.esDescanso) estado = "Descanso";
    else if (turno.esIncapacidad) estado = turno.motivoAusencia || "Incapacidad";

    row.values = [
      turno.cedula || "",
      turno.nombre || "",
      turno.contrato || metadata?.contrato || "",
      turno.jornada || estado.toUpperCase(),
      turno.fecha || "",
      turno.diaSemana || "",
      metadata?.supervisor || "",
      estado,
    ];

    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER;
      cell.alignment = { vertical: "middle", horizontal: col <= 2 ? "left" : "center" };
      cell.font = DATA_FONT;
    });
    row.height = 18;
  });

  sheetProg.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  sheetProg.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsProg.length } };

  // ---- HOJA 2: CONTRATOS ----
  const sheetContratos = workbook.addWorksheet("Contratos");

  const colsCon = [
    { header: "Cedula",    key: "cedula",     width: 16 },
    { header: "Nombre",    key: "nombre",     width: 30 },
    { header: "Campana",   key: "campana",    width: 20 },
    { header: "Contrato",  key: "contrato",   width: 30 },
    { header: "Lider",     key: "supervisor", width: 22 },
  ];

  sheetContratos.columns = colsCon.map((c) => ({ key: c.key, width: c.width }));

  const hdr2 = sheetContratos.getRow(1);
  colsCon.forEach((col, i) => {
    const cell = hdr2.getCell(i + 1);
    cell.value = col.header;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  });
  hdr2.height = 22;

  const agentesMap = new Map();
  scheduleData.forEach((t) => {
    const key = t.cedula || t.nombre;
    if (!agentesMap.has(key)) {
      agentesMap.set(key, {
        cedula: t.cedula || "",
        nombre: t.nombre || "",
        campana: t.campana || metadata?.campana || "",
        contrato: t.contrato || metadata?.contrato || "",
        supervisor: metadata?.supervisor || "",
      });
    }
  });

  Array.from(agentesMap.values()).forEach((agente, idx) => {
    const row = sheetContratos.getRow(2 + idx);
    row.values = [agente.cedula, agente.nombre, agente.campana, agente.contrato, agente.supervisor];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER;
      cell.alignment = { vertical: "middle", horizontal: col <= 2 ? "left" : "center" };
      cell.font = DATA_FONT;
    });
    row.height = 18;
  });

  sheetContratos.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  sheetContratos.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsCon.length } };

  // ---- HOJA 3: JORNADAS ----
  const sheetJornadas = workbook.addWorksheet("Jornadas");

  const colsJor = [
    { header: "Jornada",  key: "jornada",  width: 35 },
    { header: "Tipo",     key: "tipo",     width: 16 },
    { header: "Cantidad", key: "cantidad", width: 12 },
  ];

  sheetJornadas.columns = colsJor.map((c) => ({ key: c.key, width: c.width }));

  const hdr3 = sheetJornadas.getRow(1);
  colsJor.forEach((col, i) => {
    const cell = hdr3.getCell(i + 1);
    cell.value = col.header;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = BORDER;
  });
  hdr3.height = 22;

  const jornadasMap = new Map();
  scheduleData.forEach((t) => {
    if (t.esDescanso || t.esIncapacidad) return;
    const jornada = t.jornada || "";
    const tipo = t.esSplit ? "Split" : "Normal";
    const key = `${jornada}__${tipo}`;
    jornadasMap.set(key, {
      jornada,
      tipo,
      cantidad: (jornadasMap.get(key)?.cantidad || 0) + 1,
    });
  });

  Array.from(jornadasMap.values()).forEach((j, idx) => {
    const row = sheetJornadas.getRow(2 + idx);
    row.values = [j.jornada, j.tipo, j.cantidad];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER;
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
      cell.font = DATA_FONT;
    });
    row.height = 18;
  });

  sheetJornadas.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { generateFormatoTurnos, generatePlantillaPrometeo };