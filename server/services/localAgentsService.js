/**
 * localAgentsService.js
 * Lee los archivos de referencia en M_Excel/ y construye un catálogo de agentes
 * para enriquecer los turnos cuando Supabase no está disponible.
 */

const ExcelJS = require("exceljs");
const path = require("path");

const M_EXCEL_DIR = path.join(__dirname, "../../M_Excel");

// Cache del catálogo en memoria para no leer el disco cada vez
let catalogCache = null;

// ============================================================
// Helpers
// ============================================================

/** Convierte a Title Case: "CRISTIAN MATEO" → "Cristian Mateo" */
function toTitleCase(str) {
  return String(str)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .trim();
}

/**
 * Normaliza nombre para comparación:
 * quita acentos, mayúsculas, caracteres especiales, espacios múltiples
 */
function normalizeName(name) {
  return String(name)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^A-Z\s]/g, "") // solo letras y espacios
    .trim()
    .replace(/\s+/g, " ");
}

// ============================================================
// Cargar catálogo desde M_Excel
// ============================================================

/**
 * Lee los dos archivos de referencia y construye el catálogo de agentes.
 * Retorna Map<cedula, { cedula, nombreCorto, nombreCompleto, contrato, campana }>
 */
async function loadCatalog() {
  if (catalogCache) return catalogCache;

  catalogCache = new Map();

  // --- Paso 1: Formato Turnos Programados.xlsx ---
  // Columnas: Fecha | Cedula | Nombre Agente | Campaña | Supervisor | ...
  try {
    const wb1 = new ExcelJS.Workbook();
    await wb1.xlsx.readFile(
      path.join(M_EXCEL_DIR, "Formato Turnos Programados.xlsx")
    );
    const sheet = wb1.worksheets[0];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cedula = row.getCell(2).value;
      const nombre = row.getCell(3).value;
      const campana = row.getCell(4).value;

      if (cedula && typeof cedula === "number" && nombre) {
        const nombreLimpio = String(nombre).replace(/\s+/g, " ").trim();
        if (!catalogCache.has(cedula)) {
          catalogCache.set(cedula, {
            cedula,
            nombreCorto: nombreLimpio,       // "Cristian Mateo Pataquiva Bello"
            nombreCompleto: nombreLimpio.toUpperCase(), // se actualiza con Prometeo
            campana: String(campana || "").trim(),
            contrato: "",
          });
        }
      }
    }
    console.log(
      `📚 Agentes desde Formato Turnos: ${catalogCache.size}`
    );
  } catch (e) {
    console.warn("⚠️  No se pudo leer Formato Turnos Programados.xlsx:", e.message);
  }

  // --- Paso 2: Plantilla Prometeo.xlsx ---
  // Columnas: Cédula | Nombre | Contrato | Jornada | Fecha | Lider
  try {
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(
      path.join(
        M_EXCEL_DIR,
        "PLANTILLA DE PROGRAMACION TURNOS PROMETEO.xlsx"
      )
    );
    const sheet = wb2.worksheets[0]; // Solo primera hoja

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cedula = row.getCell(1).value;
      const nombre = row.getCell(2).value;
      const contrato = row.getCell(3).value;

      if (cedula && typeof cedula === "number" && nombre) {
        const nombreCompleto = String(nombre).replace(/\s+/g, " ").trim();
        const nombreCorto = toTitleCase(nombreCompleto);

        if (catalogCache.has(cedula)) {
          // Actualizar datos existentes con nombre completo y contrato
          const ag = catalogCache.get(cedula);
          ag.nombreCompleto = nombreCompleto;  // "CRISTIAN MATEO PATAQUIVA BELLO"
          ag.nombreCorto = nombreCorto;        // "Cristian Mateo Pataquiva Bello"
          if (!ag.contrato && contrato) ag.contrato = String(contrato).trim();
        } else {
          catalogCache.set(cedula, {
            cedula,
            nombreCorto,
            nombreCompleto,
            campana: "",
            contrato: String(contrato || "").trim(),
          });
        }
      }
    }
    console.log(
      `📚 Catálogo final cargado: ${catalogCache.size} agentes desde M_Excel`
    );
  } catch (e) {
    console.warn(
      "⚠️  No se pudo leer PLANTILLA DE PROGRAMACION TURNOS PROMETEO.xlsx:",
      e.message
    );
  }

  return catalogCache;
}

// ============================================================
// Matching por nombre
// ============================================================

/**
 * Busca el mejor agente en el catálogo por similitud de nombre.
 * Estrategia: palabras en común (mínimo 2, o el 40% del query).
 */
function findByName(extractedName, catalog) {
  const queryWords = normalizeName(extractedName)
    .split(" ")
    .filter((w) => w.length > 2);

  if (!queryWords.length) return null;

  let bestMatch = null;
  let bestScore = 0;
  const minMatches = Math.max(2, Math.ceil(queryWords.length * 0.4));

  for (const [, agent] of catalog) {
    const catalogWords = normalizeName(
      agent.nombreCompleto || agent.nombreCorto || ""
    ).split(" ");

    const matchCount = queryWords.filter((w) =>
      catalogWords.includes(w)
    ).length;

    const score = matchCount / queryWords.length;

    if (matchCount >= minMatches && score > bestScore) {
      bestScore = score;
      bestMatch = agent;
    }
  }

  return bestMatch;
}

// ============================================================
// Enriquecimiento local
// ============================================================

/**
 * Enriquece los turnos con datos del catálogo local (M_Excel).
 * Completa: cedula, nombreCorto, nombreCompleto, contrato, campana.
 */
async function enriquecerLocal(turnos, metadata) {
  const catalog = await loadCatalog();
  let matched = 0;

  const enrichedTurnos = turnos.map((turno) => {
    // Si ya tiene cédula real, no tocar
    const tieneReal =
      turno.cedula &&
      turno.cedula !== "???" &&
      !String(turno.cedula).includes("?");
    if (tieneReal) return turno;

    const agent = findByName(turno.nombre || "", catalog);
    if (!agent) return turno;

    matched++;
    return {
      ...turno,
      cedula: String(agent.cedula),
      nombre: agent.nombreCorto,         // Title Case para Formato Turnos
      _nombreCompleto: agent.nombreCompleto, // ALL CAPS para Prometeo (interno)
      contrato: turno.contrato || agent.contrato || "",
      campana: turno.campana || agent.campana || "",
    };
  });

  console.log(
    `📊 Enriquecimiento local: ${matched}/${turnos.length} agentes completados desde M_Excel`
  );

  return {
    turnos: enrichedTurnos,
    metadata,
    matchStats: {
      total: turnos.length,
      matched,
      unmatched: turnos.length - matched,
    },
  };
}

module.exports = { enriquecerLocal, loadCatalog };
