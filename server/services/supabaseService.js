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

/**
 * Sube una imagen a Supabase Storage
 * @param {Buffer} buffer - Buffer de la imagen
 * @param {string} fileName - Nombre del archivo
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - Ruta del archivo en storage
 */
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

/**
 * Sube un archivo Excel a Supabase Storage
 * @param {Buffer} buffer - Buffer del archivo Excel
 * @param {string} fileName - Nombre del archivo
 * @returns {Promise<string>} - Ruta del archivo en storage
 */
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

/**
 * Obtiene URL pública de descarga de un archivo
 * @param {string} bucket - Nombre del bucket
 * @param {string} path - Ruta del archivo
 * @returns {string} - URL pública
 */
function obtenerUrlPublica(bucket, path) {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Obtiene URL firmada (signed) para descarga de un archivo privado
 * @param {string} bucket - Nombre del bucket
 * @param {string} path - Ruta del archivo
 * @param {number} expiresIn - Segundos de validez (default: 1 hora)
 * @returns {Promise<string>} - URL firmada
 */
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

/**
 * Guarda un nuevo análisis en el historial
 * @param {Object} analisisData - Datos del análisis
 * @returns {Promise<Object>} - Registro creado
 */
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

/**
 * Obtiene el historial de análisis (los más recientes primero)
 * @param {number} limit - Número de registros a retornar
 * @returns {Promise<Array>} - Lista de análisis
 */
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

  // Agregar URLs públicas a cada análisis
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

/**
 * Obtiene un análisis específico por ID
 * @param {string} id - UUID del análisis
 * @returns {Promise<Object>} - Análisis con URLs
 */
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

/**
 * Elimina un análisis del historial (y sus archivos)
 * @param {string} id - UUID del análisis
 */
async function eliminarAnalisis(id) {
  if (!supabase) throw new Error("Supabase no configurado");

  // Obtener datos del análisis para eliminar archivos
  const { data: analisis } = await supabase
    .from("analisis_historial")
    .select("*")
    .eq("id", id)
    .single();

  if (analisis) {
    // Eliminar imágenes
    if (analisis.imagenes_paths && analisis.imagenes_paths.length > 0) {
      await supabase.storage
        .from(BUCKETS.IMAGENES)
        .remove(analisis.imagenes_paths);
    }

    // Eliminar Excels
    const excelPaths = [
      analisis.formato_turnos_path,
      analisis.plantilla_prometeo_path,
    ].filter(Boolean);

    if (excelPaths.length > 0) {
      await supabase.storage.from(BUCKETS.EXCELS).remove(excelPaths);
    }
  }

  // Eliminar registro de la base de datos
  const { error } = await supabase
    .from("analisis_historial")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Error eliminando análisis: ${error.message}`);

  console.log(`✅ Análisis eliminado: ${id}`);
}

// ============================================
// FUNCIONES DE AGENTES (mantener las existentes)
// ============================================

/**
 * Busca un agente por nombre parcial (como aparece en la imagen)
 * Usa múltiples estrategias: alias exacto, similitud, contención
 */
async function buscarAgentePorNombre(nombreParcial) {
  if (!supabase || !nombreParcial) return null;

  const nombreLimpio = nombreParcial.trim();

  // 1. Búsqueda exacta en alias
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
      console.log(
        `  ✅ Match por alias: "${nombreLimpio}" → ${agente.nombre} (${agente.cedula})`
      );
      return agente;
    }
  }

  // 2. Búsqueda por contención en nombre completo (ILIKE)
  const { data: containMatch } = await supabase
    .from("agentes")
    .select("*")
    .eq("activo", true)
    .ilike("nombre", `%${nombreLimpio}%`)
    .limit(1);

  if (containMatch && containMatch.length > 0) {
    console.log(
      `  ✅ Match por contención: "${nombreLimpio}" → ${containMatch[0].nombre} (${containMatch[0].cedula})`
    );
    return containMatch[0];
  }

  // 3. Búsqueda por palabras individuales (al menos 2 palabras coinciden)
  const palabras = nombreLimpio.split(/\s+/).filter((p) => p.length > 2);
  if (palabras.length >= 2) {
    const { data: allAgentes } = await supabase
      .from("agentes")
      .select("*")
      .eq("activo", true);

    if (allAgentes) {
      let bestMatch = null;
      let bestScore = 0;

      for (const agente of allAgentes) {
        const nombreAgente = agente.nombre.toLowerCase();
        let score = 0;
        for (const palabra of palabras) {
          if (nombreAgente.includes(palabra.toLowerCase())) {
            score++;
          }
        }
        if (score > bestScore && score >= 2) {
          bestScore = score;
          bestMatch = agente;
        }
      }

      if (bestMatch) {
        console.log(
          `  ✅ Match por palabras (${bestScore}/${palabras.length}): "${nombreLimpio}" → ${bestMatch.nombre} (${bestMatch.cedula})`
        );
        return bestMatch;
      }
    }
  }

  // 4. Búsqueda por apellido (última palabra del nombre parcial)
  const apellido = palabras[palabras.length - 1];
  if (apellido && apellido.length > 3) {
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
    console.log(
      "⚠️  Supabase no configurado, retornando turnos sin enriquecer"
    );
    return {
      turnos,
      metadata,
      matchStats: { total: 0, matched: 0, unmatched: 0 },
    };
  }

  console.log(
    `🔍 Enriqueciendo ${turnos.length} turnos con datos de Supabase...`
  );

  // Cache para no buscar el mismo nombre dos veces
  const cache = new Map();
  let matched = 0;
  let unmatched = 0;

  const turnosEnriquecidos = [];

  for (const turno of turnos) {
    const nombreOriginal = turno.nombre || "";
    const cedulaOriginal = turno.cedula || "";

    // Intentar buscar primero por cédula si la tiene
    let agente = null;

    if (cedulaOriginal && cedulaOriginal !== "???") {
      agente = await buscarAgentePorCedula(cedulaOriginal);
    }

    // Si no encontró por cédula, buscar por nombre
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
        contrato:
          turno.contrato || agente.contrato || metadata?.contrato || "",
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

  // Soft delete
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
 * Ej: "MARCIAL DE JESUS MAGALLANES" → ["Jesus Magallanes", "Marcial Magallanes", "Magallanes"]
 */
async function generarAliasAutomaticos(agenteId, nombreCompleto) {
  if (!supabase) return;

  const palabras = nombreCompleto
    .split(/\s+/)
    .filter(
      (p) =>
        !["DE", "DEL", "LA", "LAS", "LOS"].includes(p.toUpperCase())
    );

  const aliases = new Set();

  // Nombre completo tal cual
  aliases.add(nombreCompleto);

  // Si tiene más de 2 palabras, combinaciones útiles
  if (palabras.length >= 2) {
    const apellido = palabras[palabras.length - 1];

    // Primera palabra + último apellido
    aliases.add(`${palabras[0]} ${apellido}`);

    // Si tiene 3+ palabras: segunda palabra + apellido
    if (palabras.length >= 3) {
      aliases.add(`${palabras[1]} ${apellido}`);
    }

    // Solo apellido (si es único/largo)
    if (apellido.length > 4) {
      aliases.add(apellido);
    }
  }

  for (const alias of aliases) {
    try {
      await supabase
        .from("agentes_alias")
        .insert({ agente_id: agenteId, alias })
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
    return {
      connected: false,
      reason: "Variables de entorno no configuradas",
    };

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