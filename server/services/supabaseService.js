const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "⚠️  SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configuradas. La base de datos no estará disponible."
  );
}

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Nombres de los buckets en Supabase Storage
const BUCKETS = {
  IMAGENES: "analisis-imagenes",
  EXCELS: "analisis-excels",
};

// ============================================
// FUNCIONES DE STORAGE
// ============================================

async function subirImagen(buffer, fileName, contentType) {
  if (!supabase) throw new Error("Supabase no configurado");

  const timestamp = Date.now();
  const path = `${timestamp}-${fileName}`;

  const { data, error } = await supabase.storage
    .from(BUCKETS.IMAGENES)
    .upload(path, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw new Error(`Error subiendo imagen: ${error.message}`);
  return data.path;
}

async function subirExcel(buffer, fileName) {
  if (!supabase) throw new Error("Supabase no configurado");

  const timestamp = Date.now();
  const path = `${timestamp}-${fileName}`;

  const { data, error } = await supabase.storage
    .from(BUCKETS.EXCELS)
    .upload(path, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw new Error(`Error subiendo Excel: ${error.message}`);
  return data.path;
}

function obtenerUrlPublica(bucket, path) {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function obtenerUrlFirmada(bucket, path, expiresIn = 3600) {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(`Error obteniendo URL firmada: ${error.message}`);
  return data.signedUrl;
}

// ============================================
// FUNCIONES DE HISTORIAL
// ============================================

async function guardarAnalisis(analisisData) {
  if (!supabase) throw new Error("Supabase no configurado");

  const {
    metadata,
    imagenesPaths,
    formatoTurnosPath,
    plantillaPrometeoPath,
    stats,
  } = analisisData;

  const { data, error } = await supabase
    .from("analisis_historial")
    .insert({
      supervisor: metadata.supervisor || null,
      campana: metadata.campana || null,
      semana: metadata.semana || null,
      fecha_inicio: metadata.fechaInicio || null,
      fecha_fin: metadata.fechaFin || null,
      total_agentes: stats.agentes || 0,
      total_turnos: stats.total || 0,
      total_descansos: stats.descansos || 0,
      total_splits: stats.splits || 0,
      imagenes_paths: imagenesPaths,
      formato_turnos_path: formatoTurnosPath,
      plantilla_prometeo_path: plantillaPrometeoPath,
    })
    .select()
    .single();

  if (error) throw new Error(`Error guardando análisis: ${error.message}`);
  console.log(`✅ Análisis guardado en historial: ${data.id}`);
  return data;
}

async function obtenerHistorial(limit = 20) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("analisis_historial")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error obteniendo historial:", error.message);
    return [];
  }

  return data.map((analisis) => ({
    ...analisis,
    imagenes_urls: analisis.imagenes_paths?.map((path) =>
      obtenerUrlPublica(BUCKETS.IMAGENES, path)
    ),
    formato_turnos_url: analisis.formato_turnos_path
      ? obtenerUrlPublica(BUCKETS.EXCELS, analisis.formato_turnos_path)
      : null,
    plantilla_prometeo_url: analisis.plantilla_prometeo_path
      ? obtenerUrlPublica(BUCKETS.EXCELS, analisis.plantilla_prometeo_path)
      : null,
  }));
}

async function obtenerAnalisisPorId(id) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("analisis_historial")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(`Error obteniendo análisis: ${error.message}`);

  return {
    ...data,
    imagenes_urls: data.imagenes_paths?.map((path) =>
      obtenerUrlPublica(BUCKETS.IMAGENES, path)
    ),
    formato_turnos_url: data.formato_turnos_path
      ? obtenerUrlPublica(BUCKETS.EXCELS, data.formato_turnos_path)
      : null,
    plantilla_prometeo_url: data.plantilla_prometeo_path
      ? obtenerUrlPublica(BUCKETS.EXCELS, data.plantilla_prometeo_path)
      : null,
  };
}

async function eliminarAnalisis(id) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data: analisis } = await supabase
    .from("analisis_historial")
    .select("*")
    .eq("id", id)
    .single();

  if (analisis) {
    if (analisis.imagenes_paths && analisis.imagenes_paths.length > 0) {
      await supabase.storage
        .from(BUCKETS.IMAGENES)
        .remove(analisis.imagenes_paths);
    }

    const excelPaths = [
      analisis.formato_turnos_path,
      analisis.plantilla_prometeo_path,
    ].filter(Boolean);

    if (excelPaths.length > 0) {
      await supabase.storage.from(BUCKETS.EXCELS).remove(excelPaths);
    }
  }

  const { error } = await supabase
    .from("analisis_historial")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Error eliminando análisis: ${error.message}`);
  console.log(`✅ Análisis eliminado: ${id}`);
}

// ============================================
// NORMALIZACIÓN DE NOMBRES (mejorada para nombres colombianos)
// ============================================

/**
 * Normaliza un nombre para comparación:
 * - Quita acentos, pasa a mayúsculas, elimina caracteres especiales
 */
function normalizarNombre(nombre) {
  return String(nombre || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^A-Z\s]/g, "")         // solo letras y espacios
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Extrae palabras significativas (más de 2 caracteres, no preposiciones)
 */
const PREPOSICIONES = new Set(["DE", "DEL", "LA", "LAS", "LOS", "EL", "Y", "E"]);

function palabrasSignificativas(nombre) {
  return normalizarNombre(nombre)
    .split(" ")
    .filter(p => p.length > 2 && !PREPOSICIONES.has(p));
}

/**
 * Calcula score de similitud entre nombre extraído y nombre en BD.
 * Retorna valor entre 0 y 1.
 *
 * Estrategia mejorada para nombres colombianos compuestos:
 * - "JESUS MAGALLANES" debe encontrar "MARCIAL DE JESUS MAGALLANES"
 * - "DANIEL PIÑEROS" debe encontrar "DANIEL PIÑEROS RAMIREZ"
 * - "LEX LILIANA RIOS" debe encontrar "ALEX LILIANA RIOS" (variaciones de primer nombre)
 */
function calcularSimilitud(nombreExtraido, nombreBD) {
  const palabrasQuery = palabrasSignificativas(nombreExtraido);
  const palabrasBD = palabrasSignificativas(nombreBD);

  if (!palabrasQuery.length || !palabrasBD.length) return 0;

  // Contar cuántas palabras del query están en el nombre de BD
  let coincidencias = 0;
  for (const pq of palabrasQuery) {
    // Buscar coincidencia exacta O que el nombre BD contenga la palabra como substring
    if (palabrasBD.some(pb => pb === pq || pb.startsWith(pq) || pq.startsWith(pb))) {
      coincidencias++;
    }
  }

  // Score base: proporción de palabras del query que coinciden
  const scoreQuery = coincidencias / palabrasQuery.length;

  // Bonus si el apellido (última palabra del query) está en el nombre BD
  const apellidoQuery = palabrasQuery[palabrasQuery.length - 1];
  const apellidoBD = palabrasBD[palabrasBD.length - 1];
  const apellidoCoincide = apellidoBD === apellidoQuery ||
    palabrasBD.some(p => p === apellidoQuery);

  // Requerir mínimo: apellido coincide O al menos 2 palabras coinciden
  if (!apellidoCoincide && coincidencias < 2) return 0;

  // Si el apellido coincide, dar bonus adicional
  const bonus = apellidoCoincide ? 0.2 : 0;

  return Math.min(1, scoreQuery + bonus);
}

// ============================================
// FUNCIONES DE AGENTES
// ============================================

/**
 * Busca un agente por nombre parcial (como aparece en la imagen)
 * Usa múltiples estrategias optimizadas para nombres colombianos compuestos
 */
async function buscarAgentePorNombre(nombreParcial) {
  if (!supabase || !nombreParcial) return null;

  const nombreLimpio = nombreParcial.trim();
  const nombreNorm = normalizarNombre(nombreLimpio);

  // 1. Búsqueda exacta en alias (case-insensitive)
  const { data: aliasMatch } = await supabase
    .from("agentes_alias")
    .select("agente_id")
    .ilike("alias", nombreLimpio)
    .limit(1);

  if (aliasMatch && aliasMatch.length > 0) {
    const { data: agente } = await supabase
      .from("agentes")
      .select("*")
      .eq("id", aliasMatch[0].agente_id)
      .eq("activo", true)
      .single();

    if (agente) {
      console.log(`  ✅ Match por alias: "${nombreLimpio}" → ${agente.nombre} (${agente.cedula})`);
      return agente;
    }
  }

  // 2. Búsqueda por contención exacta en nombre completo
  const { data: containMatch } = await supabase
    .from("agentes")
    .select("*")
    .eq("activo", true)
    .ilike("nombre", `%${nombreLimpio}%`)
    .limit(1);

  if (containMatch && containMatch.length > 0) {
    console.log(`  ✅ Match por contención: "${nombreLimpio}" → ${containMatch[0].nombre} (${containMatch[0].cedula})`);
    return containMatch[0];
  }

  // 3. Búsqueda inteligente: cargar todos los agentes y calcular similitud
  // (solo cuando los métodos rápidos fallan)
  const { data: allAgentes } = await supabase
    .from("agentes")
    .select("*")
    .eq("activo", true);

  if (allAgentes && allAgentes.length > 0) {
    let bestMatch = null;
    let bestScore = 0;

    for (const agente of allAgentes) {
      const score = calcularSimilitud(nombreLimpio, agente.nombre);

      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = agente;
      }
    }

    if (bestMatch) {
      console.log(
        `  ✅ Match por similitud (${(bestScore * 100).toFixed(0)}%): "${nombreLimpio}" → ${bestMatch.nombre} (${bestMatch.cedula})`
      );
      return bestMatch;
    }

    // 4. Último recurso: buscar por apellido único si solo hay un agente con ese apellido
    const palabras = palabrasSignificativas(nombreLimpio);
    if (palabras.length >= 1) {
      const apellido = palabras[palabras.length - 1];
      if (apellido.length > 3) {
        const { data: apellidoMatch } = await supabase
          .from("agentes")
          .select("*")
          .eq("activo", true)
          .ilike("nombre", `%${apellido}%`);

        if (apellidoMatch && apellidoMatch.length === 1) {
          console.log(
            `  ✅ Match por apellido único: "${nombreLimpio}" → ${apellidoMatch[0].nombre} (${apellidoMatch[0].cedula})`
          );
          return apellidoMatch[0];
        }
      }
    }
  }

  // También buscar en alias con similitud
  const { data: allAlias } = await supabase
    .from("agentes_alias")
    .select("agente_id, alias");

  if (allAlias && allAlias.length > 0) {
    let bestAliasMatch = null;
    let bestAliasScore = 0;

    for (const aliasEntry of allAlias) {
      const score = calcularSimilitud(nombreLimpio, aliasEntry.alias);
      if (score > bestAliasScore && score >= 0.6) {
        bestAliasScore = score;
        bestAliasMatch = aliasEntry;
      }
    }

    if (bestAliasMatch) {
      const { data: agente } = await supabase
        .from("agentes")
        .select("*")
        .eq("id", bestAliasMatch.agente_id)
        .eq("activo", true)
        .single();

      if (agente) {
        console.log(
          `  ✅ Match por alias similitud (${(bestAliasScore * 100).toFixed(0)}%): "${nombreLimpio}" → ${agente.nombre} (${agente.cedula})`
        );
        return agente;
      }
    }
  }

  console.log(`  ⚠️  Sin match para: "${nombreLimpio}"`);
  return null;
}

/**
 * Busca un agente por cédula exacta
 */
async function buscarAgentePorCedula(cedula) {
  if (!supabase || !cedula) return null;

  const { data, error } = await supabase
    .from("agentes")
    .select("*")
    .eq("cedula", cedula.trim())
    .eq("activo", true)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Obtiene todos los agentes activos
 */
async function obtenerTodosLosAgentes() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agentes")
    .select("*")
    .eq("activo", true)
    .order("campana")
    .order("nombre");

  if (error) {
    console.error("Error obteniendo agentes:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Obtiene agentes filtrados por campaña
 */
async function obtenerAgentesPorCampana(campana) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agentes")
    .select("*")
    .eq("activo", true)
    .ilike("campana", `%${campana}%`)
    .order("nombre");

  if (error) return [];
  return data || [];
}

/**
 * Enriquece los turnos extraídos por Claude con datos de la BD
 * Cruza por nombre parcial y completa: cédula, nombre completo, campaña, supervisor
 */
async function enriquecerTurnos(turnos, metadata) {
  if (!supabase) {
    console.log("⚠️  Supabase no configurado, retornando turnos sin enriquecer");
    return {
      turnos,
      metadata,
      matchStats: { total: 0, matched: 0, unmatched: 0 },
    };
  }

  console.log(`🔍 Enriqueciendo ${turnos.length} turnos con datos de Supabase...`);

  // Cache para no buscar el mismo nombre dos veces
  const cache = new Map();
  let matched = 0;
  let unmatched = 0;

  const turnosEnriquecidos = [];

  for (const turno of turnos) {
    const nombreOriginal = turno.nombre || "";
    const cedulaOriginal = turno.cedula || "";

    let agente = null;

    // Intentar buscar primero por cédula si la tiene
    if (cedulaOriginal && cedulaOriginal !== "???") {
      agente = await buscarAgentePorCedula(cedulaOriginal);
    }

    // Si no encontró por cédula, buscar por nombre (con cache)
    if (!agente && nombreOriginal) {
      const cacheKey = nombreOriginal.toLowerCase().trim();
      if (cache.has(cacheKey)) {
        agente = cache.get(cacheKey);
      } else {
        agente = await buscarAgentePorNombre(nombreOriginal);
        cache.set(cacheKey, agente);
      }
    }

    if (agente) {
      matched++;
      turnosEnriquecidos.push({
        ...turno,
        cedula: agente.cedula,
        nombre: agente.nombre,
        campana: turno.campana || agente.campana,
        contrato: turno.contrato || agente.contrato || metadata?.contrato || "",
        _nombreOriginal: nombreOriginal,
        _matchedFromDB: true,
      });

      // Actualizar metadata con supervisor si no lo tiene
      if (!metadata.supervisor && agente.supervisor) {
        metadata.supervisor = agente.supervisor;
      }
    } else {
      unmatched++;
      turnosEnriquecidos.push({
        ...turno,
        _nombreOriginal: nombreOriginal,
        _matchedFromDB: false,
      });
    }
  }

  const stats = { total: turnos.length, matched, unmatched };
  console.log(
    `📊 Enriquecimiento: ${matched}/${turnos.length} turnos matcheados (${unmatched} sin match)`
  );

  return { turnos: turnosEnriquecidos, metadata, matchStats: stats };
}

// ============================================
// CRUD de Agentes
// ============================================

async function crearAgente({ cedula, nombre, campana, supervisor, contrato }) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("agentes")
    .insert({
      cedula,
      nombre: nombre.toUpperCase(),
      campana,
      supervisor,
      contrato: contrato || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Auto-generar alias básicos
  await generarAliasAutomaticos(data.id, data.nombre);

  return data;
}

async function actualizarAgente(id, updates) {
  if (!supabase) throw new Error("Supabase no configurado");

  if (updates.nombre) updates.nombre = updates.nombre.toUpperCase();

  const { data, error } = await supabase
    .from("agentes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function eliminarAgente(id) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { error } = await supabase
    .from("agentes")
    .update({ activo: false })
    .eq("id", id);

  if (error) throw new Error(error.message);
  return { success: true };
}

async function agregarAlias(agenteId, alias) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("agentes_alias")
    .insert({ agente_id: agenteId, alias })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function obtenerAliases(agenteId) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agentes_alias")
    .select("*")
    .eq("agente_id", agenteId)
    .order("alias");

  if (error) return [];
  return data || [];
}

/**
 * Genera alias automáticos a partir del nombre completo
 * Ej: "MARCIAL DE JESUS MAGALLANES" → ["Jesus Magallanes", "Marcial Magallanes", "Magallanes", "Marcial Magallanes"]
 * Mejorado para nombres colombianos con múltiples palabras
 */
async function generarAliasAutomaticos(agenteId, nombreCompleto) {
  if (!supabase) return;

  const palabras = nombreCompleto
    .split(/\s+/)
    .filter(p => !PREPOSICIONES.has(p.toUpperCase()) && p.length > 1);

  const aliases = new Set();

  // Nombre completo tal cual
  aliases.add(nombreCompleto);
  aliases.add(nombreCompleto.toLowerCase());

  if (palabras.length >= 2) {
    const apellido = palabras[palabras.length - 1];
    const primerNombre = palabras[0];

    // Primera palabra + último apellido
    aliases.add(`${primerNombre} ${apellido}`);
    aliases.add(`${primerNombre} ${apellido}`.toLowerCase());

    // Combinaciones útiles para nombres compuestos (colombianos)
    if (palabras.length >= 3) {
      // Segunda palabra + apellido (ej: "JESUS MAGALLANES" de "MARCIAL DE JESUS MAGALLANES")
      const segundaNombre = palabras[1];
      aliases.add(`${segundaNombre} ${apellido}`);
      aliases.add(`${segundaNombre} ${apellido}`.toLowerCase());

      // Tercera palabra + apellido si existe
      if (palabras.length >= 4) {
        const terceraNombre = palabras[2];
        aliases.add(`${terceraNombre} ${apellido}`);
      }
    }

    // Solo apellido (si es único/largo)
    if (apellido.length > 4) {
      aliases.add(apellido);
    }

    // Penúltima + última palabra (apellidos compuestos)
    if (palabras.length >= 2) {
      const penultima = palabras[palabras.length - 2];
      if (!PREPOSICIONES.has(penultima.toUpperCase()) && penultima.length > 2) {
        aliases.add(`${penultima} ${apellido}`);
      }
    }
  }

  for (const alias of aliases) {
    if (!alias || alias.trim().length < 3) continue;
    try {
      await supabase
        .from("agentes_alias")
        .insert({ agente_id: agenteId, alias: alias.trim() })
        .select();
    } catch (e) {
      // Ignorar duplicados
    }
  }
}

/**
 * Verifica si Supabase está configurado y conectado
 */
async function verificarConexion() {
  if (!supabase)
    return { connected: false, reason: "Variables de entorno no configuradas" };

  try {
    const { data, error } = await supabase
      .from("agentes")
      .select("id")
      .limit(1);

    if (error) return { connected: false, reason: error.message };
    return { connected: true, agentesCount: data ? data.length : 0 };
  } catch (e) {
    return { connected: false, reason: e.message };
  }
}

module.exports = {
  // Funciones de agentes
  buscarAgentePorNombre,
  buscarAgentePorCedula,
  obtenerTodosLosAgentes,
  obtenerAgentesPorCampana,
  enriquecerTurnos,
  crearAgente,
  actualizarAgente,
  eliminarAgente,
  agregarAlias,
  obtenerAliases,
  verificarConexion,

  // Funciones de storage
  subirImagen,
  subirExcel,
  obtenerUrlPublica,
  obtenerUrlFirmada,

  // Funciones de historial
  guardarAnalisis,
  obtenerHistorial,
  obtenerAnalisisPorId,
  eliminarAnalisis,

  // Constantes
  BUCKETS,
};