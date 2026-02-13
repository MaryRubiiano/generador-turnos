const ExcelJS = require("exceljs");

// ============================================
// HELPERS
// ============================================

/**
 * Calcula las horas trabajadas entre dos strings HH:MM
 */
function calcularHoras(inicio, fin) {
  if (!inicio || !fin) return 0;
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  const totalMin = h2 * 60 + m2 - (h1 * 60 + m1);
  return totalMin > 0 ? totalMin / 60 : 0;
}

/**
 * Calcula horas totales de un turno (incluyendo split)
 */
function calcularHorasTotales(turno) {
  if (turno.esDescanso || turno.esIncapacidad) return 0;

  let horas = calcularHoras(turno.horaInicio, turno.horaFin);

  if (turno.esSplit && turno.splitHoraInicio2 && turno.splitHoraFin2) {
    horas += calcularHoras(turno.splitHoraInicio2, turno.splitHoraFin2);
  }

  // Restar almuerzo si tiene
  if (turno.almuerzo && typeof turno.almuerzo === "string") {
    const partes = turno.almuerzo.split("-").map((s) => s.trim());
    if (partes.length === 2) {
      const duracion = calcularHoras(partes[0], partes[1]);
      horas -= duracion;
    }
  }

  return Math.max(0, horas);
}

/**
 * Formatea hora HH:MM a string legible
 */
function formatHora(hora) {
  if (!hora || hora === "null") return "";
  return hora;
}

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

  // ---- ESTILOS ----
  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1B52F5" }, // azul brand
  };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const headerAlignment = { horizontal: "center", vertical: "middle" };
  const borderThin = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const descansoFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF3CD" }, // amarillo suave
  };
  const incapacidadFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFDE8D8" }, // naranja suave
  };

  // ---- TÍTULO ----
  sheet.mergeCells("A1:J1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "FORMATO TURNOS PROGRAMADOS";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1B52F5" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 30;

  // ---- METADATA ----
  sheet.mergeCells("A2:E2");
  sheet.getCell("A2").value = `Supervisor: ${metadata?.supervisor || ""}`;
  sheet.getCell("A2").font = { bold: true };

  sheet.mergeCells("F2:J2");
  sheet.getCell("F2").value = `Campaña: ${metadata?.campana || ""}`;
  sheet.getCell("F2").font = { bold: true };

  sheet.mergeCells("A3:E3");
  sheet.getCell("A3").value = `Semana: ${metadata?.semana || ""}`;

  sheet.mergeCells("F3:J3");
  sheet.getCell("F3").value = `Contrato: ${metadata?.contrato || ""}`;

  // ---- ENCABEZADOS ----
  const headers = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Cédula", key: "cedula", width: 16 },
    { header: "Nombre Agente", key: "nombre", width: 30 },
    { header: "Campaña", key: "campana", width: 20 },
    { header: "Supervisor", key: "supervisor", width: 22 },
    { header: "Hora Inicio", key: "horaInicio", width: 13 },
    { header: "Hora Fin", key: "horaFin", width: 13 },
    { header: "Almuerzo", key: "almuerzo", width: 20 },
    { header: "Jornada", key: "jornada", width: 28 },
    { header: "Observación", key: "obs", width: 20 },
  ];

  sheet.columns = headers.map((h) => ({ key: h.key, width: h.width }));

  const headerRow = sheet.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h.header;
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = headerAlignment;
    cell.border = borderThin;
  });
  headerRow.height = 22;

  // ---- DATOS ----
  // Ordenar por fecha, luego por nombre
  const sorted = [...scheduleData].sort((a, b) => {
    if (a.fecha < b.fecha) return -1;
    if (a.fecha > b.fecha) return 1;
    return (a.nombre || "").localeCompare(b.nombre || "");
  });

  sorted.forEach((turno, idx) => {
    const row = sheet.getRow(6 + idx);

    const isDescanso = turno.esDescanso;
    const isIncapacidad = turno.esIncapacidad;

    // Valor de observación
    let obs = "";
    if (isDescanso) obs = "DESCANSO";
    else if (isIncapacidad) obs = turno.motivoAusencia || "INCAPACIDAD";

    // Horas mostradas
    const horaInicio = isDescanso || isIncapacidad ? "" : formatHora(turno.horaInicio);
    const horaFin = isDescanso || isIncapacidad ? "" : formatHora(turno.horaFin);
    let almuerzo = isDescanso || isIncapacidad ? "" : (turno.almuerzo || "");
    if (turno.esSplit) almuerzo = ""; // split no tiene almuerzo

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

    // Estilo de fila
    const fillColor = isIncapacidad
      ? incapacidadFill
      : isDescanso
      ? descansoFill
      : idx % 2 === 0
      ? null
      : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FC" } };

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: colNumber <= 3 ? "left" : "center" };
      cell.font = { size: 10 };
      if (fillColor) cell.fill = fillColor;
    });

    row.height = 18;
  });

  // ---- FREEZE PANES ----
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 5 }];

  // ---- AUTO FILTER ----
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: 10 },
  };

  // Generar buffer
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

  // ---- HOJA 1: PROGRAMACIÓN ----
  const sheetProg = workbook.addWorksheet("Programación Turnos");

  const headerFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1B52F5" },
  };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const borderThin = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  // Título
  sheetProg.mergeCells("A1:H1");
  const titleCell = sheetProg.getCell("A1");
  titleCell.value = "PLANTILLA PROGRAMACIÓN TURNOS - PROMETEO";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1B52F5" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheetProg.getRow(1).height = 30;

  // Metadata
  sheetProg.mergeCells("A2:D2");
  sheetProg.getCell("A2").value = `Líder: ${metadata?.supervisor || ""}`;
  sheetProg.getCell("A2").font = { bold: true };

  sheetProg.mergeCells("E2:H2");
  sheetProg.getCell("E2").value = `Semana: ${metadata?.semana || ""}`;
  sheetProg.getCell("E2").font = { bold: true };

  // Encabezados
  const headers = [
    { header: "Cédula", key: "cedula", width: 16 },
    { header: "Nombre Agente", key: "nombre", width: 30 },
    { header: "Contrato", key: "contrato", width: 16 },
    { header: "Jornada", key: "jornada", width: 30 },
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Día", key: "dia", width: 12 },
    { header: "Líder", key: "lider", width: 22 },
    { header: "Estado", key: "estado", width: 20 },
  ];

  sheetProg.columns = headers.map((h) => ({ key: h.key, width: h.width }));

  const headerRow = sheetProg.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h.header;
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderThin;
  });
  headerRow.height = 22;

  // Ordenar: por nombre, luego por fecha
  const sorted = [...scheduleData].sort((a, b) => {
    const nameComp = (a.nombre || "").localeCompare(b.nombre || "");
    if (nameComp !== 0) return nameComp;
    return (a.fecha || "").localeCompare(b.fecha || "");
  });

  const descansoFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF3CD" },
  };
  const incapacidadFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFDE8D8" },
  };

  sorted.forEach((turno, idx) => {
    const row = sheetProg.getRow(5 + idx);

    const isDescanso = turno.esDescanso;
    const isIncapacidad = turno.esIncapacidad;

    let estado = "Trabajando";
    if (isDescanso) estado = "Descanso";
    else if (isIncapacidad) estado = turno.motivoAusencia || "Incapacidad";

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

    const fillColor = isIncapacidad
      ? incapacidadFill
      : isDescanso
      ? descansoFill
      : idx % 2 === 0
      ? null
      : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FC" } };

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: colNumber <= 2 ? "left" : "center" };
      cell.font = { size: 10 };
      if (fillColor) cell.fill = fillColor;
    });

    row.height = 18;
  });

  sheetProg.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }];
  sheetProg.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: 8 },
  };

  // ---- HOJA 2: CONTRATOS (resumen por agente) ----
  const sheetContratos = workbook.addWorksheet("Contratos");

  sheetContratos.columns = [
    { header: "Cédula", key: "cedula", width: 16 },
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Campaña", key: "campana", width: 20 },
    { header: "Contrato", key: "contrato", width: 16 },
    { header: "Líder", key: "supervisor", width: 22 },
  ];

  const hdrRow2 = sheetContratos.getRow(1);
  ["Cédula", "Nombre", "Campaña", "Contrato", "Líder"].forEach((h, i) => {
    const cell = hdrRow2.getCell(i + 1);
    cell.value = h;
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderThin;
  });
  hdrRow2.height = 22;

  // Agentes únicos
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
    row.values = [
      agente.cedula,
      agente.nombre,
      agente.campana,
      agente.contrato,
      agente.supervisor,
    ];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: col <= 2 ? "left" : "center" };
      cell.font = { size: 10 };
      if (idx % 2 !== 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FC" } };
      }
    });
    row.height = 18;
  });

  // ---- HOJA 3: JORNADAS (resumen de jornadas únicas) ----
  const sheetJornadas = workbook.addWorksheet("Jornadas");

  sheetJornadas.columns = [
    { header: "Jornada", key: "jornada", width: 35 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Cantidad", key: "cantidad", width: 12 },
  ];

  const hdrRow3 = sheetJornadas.getRow(1);
  ["Jornada", "Tipo", "Cantidad"].forEach((h, i) => {
    const cell = hdrRow3.getCell(i + 1);
    cell.value = h;
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderThin;
  });
  hdrRow3.height = 22;

  // Contar jornadas únicas
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
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
      cell.font = { size: 10 };
      if (idx % 2 !== 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FC" } };
      }
    });
    row.height = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { generateFormatoTurnos, generatePlantillaPrometeo };