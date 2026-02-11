const ExcelJS = require("exceljs");

// Non-breaking space character used in the template format
const NBSP = "\u00a0";

/**
 * Genera el archivo "Formato_Turnos_Programados.xlsx" y retorna el Buffer
 * Estructura: Fecha | Cedula | Nombre Agente | Campaña | Supervisor | Hora Inicio Turno | Hora Fin Turno | Almuerzo
 *
 * Para turnos SPLIT:
 *   Hora Inicio Turno = "6:00:00 a. m. -  10:00: 00 a.m" (primera franja completa)
 *   Hora Fin Turno    = "5:00:00 p. m. -  10:00: 00 p.m" (segunda franja completa)
 *   Almuerzo = vacío
 *
 * Para turnos NORMALES:
 *   Hora Inicio Turno = time object (ej: 07:42)
 *   Hora Fin Turno    = time object (ej: 18:00)
 *   Almuerzo = "1:00 pm - 2:00 pm"
 *
 * Para DESCANSO:
 *   Hora Inicio Turno = "Descanso"
 *   Hora Fin Turno    = "Descanso"
 *   Almuerzo = vacío
 *
 * @returns {Promise<Buffer>} - Buffer del archivo Excel
 */
async function generateFormatoTurnos(turnos, metadata) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Hoja1");

  // Definir columnas
  ws.columns = [
    { header: "Fecha", key: "fecha", width: 15 },
    { header: "Cédula", key: "cedula", width: 15 },
    { header: "Nombre Agente", key: "nombre", width: 35 },
    { header: "Campaña", key: "campana", width: 25 },
    { header: "Supervisor", key: "supervisor", width: 30 },
    { header: "Hora Inicio Turno", key: "horaInicio", width: 35 },
    { header: "Hora Fin Turno", key: "horaFin", width: 35 },
    { header: "Almuerzo", key: "almuerzo", width: 22 },
  ];

  // Estilo del encabezado
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  // Ordenar turnos por fecha, luego campaña (CORFICOLOMBIANA primero), luego nombre
  const campanaPriority = (campana) => {
    const c = (campana || "").toUpperCase();
    if (c.includes("CORFICOLOMBIANA")) return 0;
    if (c.includes("AVC")) return 1;
    return 2;
  };

  const sortedTurnos = [...turnos].sort((a, b) => {
    const dateCompare = (a.fecha || "").localeCompare(b.fecha || "");
    if (dateCompare !== 0) return dateCompare;
    const campCompare = campanaPriority(a.campana) - campanaPriority(b.campana);
    if (campCompare !== 0) return campCompare;
    return (a.nombre || "").localeCompare(b.nombre || "");
  });

  // Agregar filas de datos
  for (const turno of sortedTurnos) {
    let horaInicioVal, horaFinVal, almuerzoVal;

    if (turno.esDescanso) {
      horaInicioVal = "Descanso";
      horaFinVal = "Descanso";
      almuerzoVal = "";
    } else if (turno.esSplit) {
      // Para turnos split: cada columna muestra una franja como rango en formato 12h
      // "6:00:00 a. m. -  10:00: 00 a.m"
      horaInicioVal = formatRangoFormatoTurnos(turno.horaInicio, turno.horaFin);
      horaFinVal = formatRangoFormatoTurnos(turno.splitHoraInicio2, turno.splitHoraFin2);
      almuerzoVal = "";
    } else {
      // Turno normal: hora como time object via ExcelJS
      horaInicioVal = formatTimeAsExcelTime(turno.horaInicio);
      horaFinVal = formatTimeAsExcelTime(turno.horaFin);
      almuerzoVal = turno.almuerzo ? formatAlmuerzo12h(turno.almuerzo) : "";
    }

    const row = ws.addRow({
      fecha: turno.fecha ? new Date(turno.fecha + "T00:00:00") : "",
      cedula: turno.cedula ? Number(turno.cedula) || turno.cedula : "",
      nombre: formatNombreAgente(turno.nombre || ""),
      campana: turno.campana || metadata?.campana || "",
      supervisor: formatNombreSupervisor(metadata?.supervisor || ""),
      horaInicio: horaInicioVal,
      horaFin: horaFinVal,
      almuerzo: almuerzoVal,
    });

    // Formato de fecha
    if (turno.fecha) {
      row.getCell("fecha").numFmt = "yyyy-mm-dd";
    }

    // Si hora es un time object (no string), aplicar formato de hora AM/PM
    if (!turno.esDescanso && !turno.esSplit) {
      if (typeof horaInicioVal === "number") {
        row.getCell("horaInicio").numFmt = "h:mm AM/PM";
      }
      if (typeof horaFinVal === "number") {
        row.getCell("horaFin").numFmt = "h:mm AM/PM";
      }
    }

    // Centrar todas las celdas de la fila
    row.alignment = { horizontal: "center", vertical: "middle" };
  }

  // Bordes para todas las celdas con datos
  const totalRows = ws.rowCount;
  for (let row = 1; row <= totalRows; row++) {
    for (let col = 1; col <= 8; col++) {
      const cell = ws.getCell(row, col);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      // Asegurar centrado en todas las celdas
      if (!cell.alignment) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }
  }

  // Retornar como Buffer en lugar de escribir a archivo
  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`  📄 Formato Turnos generado (${buffer.length} bytes)`);
  return buffer;
}

/**
 * Genera el archivo "PLANTILLA_DE_PROGRAMACION_TURNOS_PROMETEO.xlsx" y retorna el Buffer
 *
 * Columnas: Cédula | Nombre | Contrato | Jornada | Fecha | Líder
 *
 * Jornada para SPLIT: "6:00:00 a.\u00a0m. -  10:00: 00 a.m // 5:00:00 p.\u00a0m. -  10:00: 00 p.m"
 * Jornada para NORMAL: "7:42:00 a.\u00a0m. -  06:00: 00 p.m"
 * Jornada para DESCANSO: "Descanso"
 *
 * @returns {Promise<Buffer>} - Buffer del archivo Excel
 */
async function generatePlantillaPrometeo(turnos, metadata) {
  const workbook = new ExcelJS.Workbook();

  const sheetName = metadata?.semana || generarNombreHoja(turnos);

  const ws = workbook.addWorksheet(sheetName);

  ws.columns = [
    { header: "Cédula", key: "cedula", width: 15 },
    { header: "Nombre ", key: "nombre", width: 40 },
    { header: "Contrato", key: "contrato", width: 45 },
    { header: "Jornada", key: "jornada", width: 55 },
    { header: "Fecha", key: "fecha", width: 15 },
    { header: "Líder ", key: "lider", width: 35 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2F5496" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };

  const campanaPriority = (campana) => {
    const c = (campana || "").toUpperCase();
    if (c.includes("CORFICOLOMBIANA")) return 0;
    if (c.includes("AVC")) return 1;
    return 2;
  };

  const sortedTurnos = [...turnos].sort((a, b) => {
    const campCompare = campanaPriority(a.campana) - campanaPriority(b.campana);
    if (campCompare !== 0) return campCompare;
    const cedulaCompare = (a.cedula || "").localeCompare(b.cedula || "");
    if (cedulaCompare !== 0) return cedulaCompare;
    return (a.fecha || "").localeCompare(b.fecha || "");
  });

  for (const turno of sortedTurnos) {
    let jornada;

    if (turno.esDescanso) {
      jornada = "Descanso";
    } else if (turno.esSplit) {
      // Split: "6:00:00 a.\u00a0m. -  10:00: 00 a.m // 5:00:00 p.\u00a0m. -  10:00: 00 p.m"
      const franja1 = formatRangoPlantilla(turno.horaInicio, turno.horaFin);
      const franja2 = formatRangoPlantilla(turno.splitHoraInicio2, turno.splitHoraFin2);
      jornada = `${franja1} // ${franja2}`;
    } else {
      // Normal: "7:42:00 a.\u00a0m. -  06:00: 00 p.m"
      jornada = formatRangoPlantilla(turno.horaInicio, turno.horaFin);
    }

    const row = ws.addRow({
      cedula: turno.cedula ? Number(turno.cedula) || turno.cedula : "",
      nombre: (turno.nombre || "").toUpperCase(),
      contrato: turno.contrato || metadata?.contrato || "",
      jornada: jornada,
      fecha: turno.fecha ? new Date(turno.fecha + "T00:00:00") : "",
      lider: (metadata?.supervisor || "").toUpperCase(),
    });

    if (turno.fecha) {
      row.getCell("fecha").numFmt = "yyyy-mm-dd";
    }

    // Centrar todas las celdas de la fila
    row.alignment = { horizontal: "center", vertical: "middle" };
  }

  const totalRows = ws.rowCount;
  for (let row = 1; row <= totalRows; row++) {
    for (let col = 1; col <= 6; col++) {
      const cell = ws.getCell(row, col);
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      // Asegurar centrado en todas las celdas
      if (!cell.alignment) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }
  }

  // === Hoja de Contratos ===
  const wsContratos = workbook.addWorksheet("Contratos");
  wsContratos.columns = [
    { header: "Contratos", key: "contrato", width: 45 },
    { header: "id", key: "id", width: 8 },
    { header: "Contrato_Jornada", key: "contrato_jornada", width: 20 },
  ];

  const headerContratos = wsContratos.getRow(1);
  headerContratos.font = { bold: true };
  headerContratos.alignment = { horizontal: "center", vertical: "middle" };

  const contratos = [
    "1 | SET_SURA - MESA DE AYUDA",
    "2 | U0809-01-SET_SANVICENTE MESA",
    "3 | C-U768-01-SET_STOP_MESATI",
    "4 | 6063104030-MESA DE AYUDA MAYA",
    "5 | C-U620-01-SET_COMFAMA_MESATI",
    "6 | U0537-05-SET_GCO_MESA D AYUDA",
    "7 | U0537-05-SET_GCO_SOPORTES",
    "8 | C-U620-01-SET_COMFAMA SOPORTE",
    "9 | U0377-04-SET_SURA_SOPORTE SIT",
    "10 | U0377-06-SET_SURA_SOPORTE SIT",
  ];

  contratos.forEach((c, idx) => {
    const row = wsContratos.addRow({
      contrato: c,
      id: idx + 1,
      contrato_jornada: `_jornadas_${idx + 1}`,
    });
    row.alignment = { horizontal: "center", vertical: "middle" };
  });

  // === Hoja de Jornadas ===
  const wsJornadas = workbook.addWorksheet("Jornadas");

  const jornadasComunes = [
    "1 | 05:00 - 12:00",
    "2 | 06:00 - 12:00",
    "3 | 06:00 - 13:00",
    "4 | 06:00 - 14:00",
    "5 | 06:00 - 14:00 D 1h",
    "6 | 06:00 - 15:00 D 1h",
    "7 | 06:00 - 15:30 D 1h",
    "8 | 06:00 - 16:00 D 1h",
    "9 | 06:30 - 14:30",
    "10 | 06:30 - 15:30 D 1h",
    "11 | 07:00 - 12:00",
    "12 | 07:00 - 13:00",
    "13 | 07:00 - 14:00",
    "14 | 07:00 - 15:00",
    "15 | 07:00 - 15:30 D 1h",
    "16 | 07:00 - 16:00 D 1h",
    "17 | 07:00 - 16:30 D 1h",
    "18 | 07:00 - 17:00 D 1h",
    "19 | 07:30 - 15:00",
    "20 | 07:30 - 15:30",
    "21 | 07:30 - 16:30 D 1h",
    "22 | 07:30 - 17:00 D 1h",
    "23 | 07:30 - 17:30 D 1h",
    "24 | 08:00 - 15:00",
    "25 | 08:00 - 16:00",
    "26 | 08:00 - 17:00 D 1h",
    "27 | 08:00 - 17:30 D 1h",
    "28 | 08:00 - 18:00 D 1h",
    "29 | 08:30 - 17:30 D 1h",
    "30 | 08:30 - 18:00 D 1h",
    "31 | 09:00 - 15:00",
    "32 | 09:00 - 18:00 D 1h",
    "33 | 10:00 - 16:00",
    "34 | 14:00 - 21:00",
    "35 | 14:00 - 21:30",
    "36 | 14:30 - 22:00",
    "37 | 15:00 - 22:00",
    "38 | 21:00 - 06:00",
    "39 | 22:00 - 05:00",
    "40 | 22:00 - 06:00",
  ];

  wsJornadas.getCell("A1").value = 1;
  wsJornadas.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  
  jornadasComunes.forEach((j, idx) => {
    const cell = wsJornadas.getCell(idx + 2, 1);
    cell.value = j;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Retornar como Buffer en lugar de escribir a archivo
  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`  📄 Plantilla Prometeo generada (${buffer.length} bytes)`);
  return buffer;
}

// ============================================
// FUNCIONES DE FORMATO
// ============================================

/**
 * Convierte HH:MM (24h) a formato "H:MM:00 a.\u00a0m." o "H:MM:00 p.\u00a0m."
 * Formato de la PRIMERA hora en un rango (sin leading zero, con NBSP)
 * Ejemplo: "06:00" → "6:00:00 a.\u00a0m.", "17:00" → "5:00:00 p.\u00a0m."
 */
function formatHora12_first(hora) {
  if (!hora) return "";
  const parts = hora.split(":");
  if (parts.length < 2) return hora;

  let h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return hora;

  const suffix = h >= 12 ? `p.${NBSP}m.` : `a.${NBSP}m.`;
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")}:00 ${suffix}`;
}

/**
 * Convierte HH:MM (24h) a formato "HH:MM: 00 a.m" o "HH:MM: 00 p.m"
 * Formato de la SEGUNDA hora en un rango (con leading zero, espacio antes de 00, sin NBSP)
 * Ejemplo: "10:00" → "10:00: 00 a.m", "22:00" → "10:00: 00 p.m"
 */
function formatHora12_second(hora) {
  if (!hora) return "";
  const parts = hora.split(":");
  if (parts.length < 2) return hora;

  let h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return hora;

  const suffix = h >= 12 ? "p.m" : "a.m";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}: 00 ${suffix}`;
}

/**
 * Formatea un rango de horas para la Plantilla Prometeo
 * "7:42:00 a.\u00a0m. -  06:00: 00 p.m"
 * Primer hora usa formatHora12_first, segunda usa formatHora12_second
 */
function formatRangoPlantilla(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return "";
  return `${formatHora12_first(horaInicio)} -  ${formatHora12_second(horaFin)}`;
}

/**
 * Formatea un rango de horas para el Formato Turnos (columnas Hora Inicio/Fin en split)
 * Mismo formato que Plantilla: "6:00:00 a.\u00a0m. -  10:00: 00 a.m"
 */
function formatRangoFormatoTurnos(horaInicio, horaFin) {
  if (!horaInicio || !horaFin) return "";
  return `${formatHora12_first(horaInicio)} -  ${formatHora12_second(horaFin)}`;
}

/**
 * Convierte hora HH:MM a un valor numérico de Excel time (fracción del día)
 * Para turnos normales en Formato Turnos
 * Ejemplo: "07:42" → 0.32083... (que Excel muestra como 7:42)
 */
function formatTimeAsExcelTime(hora) {
  if (!hora) return "";
  const parts = hora.split(":");
  if (parts.length < 2) return hora;

  const h = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return hora;

  // Excel time = (hours * 60 + minutes) / (24 * 60)
  return (h * 60 + m) / 1440;
}

/**
 * Formatea el almuerzo en formato 12h para el Formato Turnos
 * "12:00 - 13:00" → "12:00 pm - 1:00 pm"
 * "13:00 - 14:00" → "1:00 pm - 2:00 pm"
 */
function formatAlmuerzo12h(almuerzoStr) {
  if (!almuerzoStr || almuerzoStr === "null" || almuerzoStr === "n/a") return "";

  const match = almuerzoStr.match(
    /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/
  );
  if (!match) return almuerzoStr;

  let h1 = parseInt(match[1]);
  const m1 = parseInt(match[2]);
  let h2 = parseInt(match[3]);
  const m2 = parseInt(match[4]);

  const suffix1 = h1 >= 12 ? "pm" : "am";
  const suffix2 = h2 >= 12 ? "pm" : "am";
  const h1_12 = h1 > 12 ? h1 - 12 : h1 === 0 ? 12 : h1;
  const h2_12 = h2 > 12 ? h2 - 12 : h2 === 0 ? 12 : h2;

  return `${h1_12}:${String(m1).padStart(2, "0")} ${suffix1} - ${h2_12}:${String(m2).padStart(2, "0")} ${suffix2}`;
}

/**
 * Formato del nombre del agente para Formato Turnos (Title Case)
 */
function formatNombreAgente(nombre) {
  if (!nombre) return "";
  return nombre
    .split(" ")
    .map((word) => {
      if (["DE", "DEL", "LA", "LAS", "LOS", "Y"].includes(word.toUpperCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Formato del nombre del supervisor para Formato Turnos (Title Case)
 */
function formatNombreSupervisor(nombre) {
  if (!nombre) return "";
  return nombre
    .split(" ")
    .map((word) => {
      if (["DE", "DEL", "LA", "LAS", "LOS", "Y"].includes(word.toUpperCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Generar nombre de hoja basado en el rango de fechas
 */
function generarNombreHoja(turnos) {
  if (!turnos || turnos.length === 0) return "Turnos";

  const fechas = turnos
    .filter((t) => t.fecha)
    .map((t) => t.fecha)
    .sort();

  if (fechas.length === 0) return "Turnos";

  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  const primera = new Date(fechas[0] + "T00:00:00");
  const ultima = new Date(fechas[fechas.length - 1] + "T00:00:00");

  const diaInicio = primera.getDate();
  const diaFin = ultima.getDate();
  const mes = meses[primera.getMonth()];

  return `del ${diaInicio} al ${diaFin} de ${mes}`;
}

module.exports = { generateFormatoTurnos, generatePlantillaPrometeo };