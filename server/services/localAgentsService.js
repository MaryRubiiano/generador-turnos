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
 * - Reemplaza ñ→N ANTES de NFD (para que no quede como N + tilde combinado)
 * - Quita acentos, tildes, caracteres especiales
 * - Resultado: "Piñeros" = "Pineros", "José" = "JOSE"
 */
function normalizeName(name) {
  return String(name)
    .toUpperCase()
    // Reemplazar ñ/Ñ explícitamente antes de NFD
    .replace(/Ñ/g, "N")
    .replace(/ñ/g, "N")
    // Descomponer caracteres con diacríticos (á → a + combining accent)
    .normalize("NFD")
    // Eliminar todos los diacríticos (acentos, tildes, etc.)
    .replace(/[\u0300-\u036f]/g, "")
    // Solo letras A-Z y espacios
    .replace(/[^A-Z\s]/g, "")
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
            nombreCorto: nombreLimpio,
            nombreCompleto: nombreLimpio.toUpperCase(),
            campana: String(campana || "").trim(),
            contrato: "",
          });
        }
      }
    }
    console.log(`📚 Agentes desde Formato Turnos: ${catalogCache.size}`);
  } catch (e) {
    console.warn("⚠️  No se pudo leer Formato Turnos Programados.xlsx:", e.message);
  }

  // --- Paso 2: Plantilla Prometeo.xlsx ---
  try {
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(
      path.join(M_EXCEL_DIR, "PLANTILLA DE PROGRAMACION TURNOS PROMETEO.xlsx")
    );
    const sheet = wb2.worksheets[0];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cedula = row.getCell(1).value;
      const nombre = row.getCell(2).value;
      const contrato = row.getCell(3).value;

      if (cedula && typeof cedula === "number" && nombre) {
        const nombreCompleto = String(nombre).replace(/\s+/g, " ").trim();
        const nombreCorto = toTitleCase(nombreCompleto);

        if (catalogCache.has(cedula)) {
          const ag = catalogCache.get(cedula);
          ag.nombreCompleto = nombreCompleto;
          ag.nombreCorto = nombreCorto;
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
    console.log(`📚 Catálogo final cargado: ${catalogCache.size} agentes desde M_Excel`);
  } catch (e) {
    console.warn(
      "⚠️  No se pudo leer PLANTILLA DE PROGRAMACION TURNOS PROMETEO.xlsx:",
      e.message
    );
  }

  return catalogCache;
}

// ============================================================
// Matching por nombre (mejorado para nombres colombianos)
// ============================================================

const PREPOSICIONES = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E"]);

/**
 * Extrae palabras significativas (más de 2 letras, no preposiciones)
 */
function palabrasSignificativas(nombre) {
  return normalizeName(nombre)
    .split(" ")
    .filter((p) => p.length > 2 && !PREPOSICIONES.has(p));
}

/**
 * Busca el mejor agente en el catálogo por similitud de nombre.
 * Normaliza ñ y tildes en ambos lados antes de comparar.
 * Ej: "Daniel Piñeros" → normaliza a "DANIEL PINEROS" → encuentra "DANIEL PIÑEROS" en BD
 */
function findByName(extractedName, catalog) {
  const queryWords = palabrasSignificativas(extractedName);

  if (!queryWords.length) return null;

  let bestMatch = null;
  let bestScore = 0;

  // Mínimo requerido: 2 palabras coinciden o 40% del query
  const minMatches = Math.max(2, Math.ceil(queryWords.length * 0.4));

  for (const [, agent] of catalog) {
    const catalogWords = palabrasSignificativas(
      agent.nombreCompleto || agent.nombreCorto || ""
    );

    // Contar coincidencias (comparación normalizada)
    let matchCount = 0;
    for (const qw of queryWords) {
      if (catalogWords.some((cw) => cw === qw || cw.startsWith(qw) || qw.startsWith(cw))) {
        matchCount++;
      }
    }

    const score = matchCount / queryWords.length;

    // Verificar que el apellido coincide (última palabra del query)
    const apellidoQuery = queryWords[queryWords.length - 1];
    const apellidoCoincide = catalogWords.some((cw) => cw === apellidoQuery);

    // Requerir mínimo coincidencias O apellido coincide
    if (matchCount < minMatches && !apellidoCoincide) continue;

    const scoreFinal = apellidoCoincide ? Math.min(1, score + 0.2) : score;

    if (scoreFinal > bestScore && scoreFinal >= 0.4) {
      bestScore = scoreFinal;
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
      nombre: agent.nombreCorto,
      _nombreCompleto: agent.nombreCompleto,
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