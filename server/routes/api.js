const express = require("express");
const multer = require("multer");
const { analyzeScheduleImages } = require("../services/claudeService");
const {
  generateFormatoTurnos,
  generatePlantillaPrometeo,
} = require("../services/excelService");
const {
  obtenerTodosLosAgentes,
  obtenerAgentesPorCampana,
  crearAgente,
  actualizarAgente,
  eliminarAgente,
  agregarAlias,
  obtenerAliases,
  verificarConexion,
  subirImagen,
  subirExcel,
  guardarAnalisis,
  obtenerHistorial,
  obtenerAnalisisPorId,
  eliminarAnalisis,
} = require("../services/supabaseService");

const router = express.Router();

// Configurar multer para recibir imágenes (múltiples) - solo en memoria
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes PNG, JPG o WebP"), false);
    }
  },
});

// ============================================
// ENDPOINTS DE ANÁLISIS Y GENERACIÓN
// ============================================

/**
 * POST /api/analyze
 * Recibe una o múltiples imágenes de maya horaria y las analiza con Claude
 * Luego las sube a Supabase Storage y guarda metadata en BD
 */
router.post("/analyze", upload.array("images", 10), async (req, res) => {
  try {
    let files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No se enviaron imágenes" });
    }

    console.log(`📸 ${files.length} imagen(es) recibida(s), analizando con Claude...`);

    // 1. Analizar con Claude
    const images = files.map((file) => ({
      base64: file.buffer.toString("base64"),
      mediaType: file.mimetype,
      originalName: file.originalname,
    }));

    const result = await analyzeScheduleImages(images);

    // 2. Subir imágenes a Supabase Storage
    console.log("📤 Subiendo imágenes a Supabase Storage...");
    const imagenesPaths = [];

    for (const file of files) {
      try {
        const path = await subirImagen(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        imagenesPaths.push(path);
      } catch (error) {
        console.warn(`⚠️  Error subiendo imagen ${file.originalname}:`, error.message);
      }
    }

    // Agregar paths de imágenes al resultado
    result.imagenesPaths = imagenesPaths;

    console.log("✅ Análisis completado");
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Error en análisis:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/generate
 * Recibe los datos confirmados/modificados y genera los dos Excel
 * Los guarda en Supabase Storage y crea registro en historial
 */
router.post("/generate", async (req, res) => {
  try {
    const { scheduleData, metadata, imagenesPaths } = req.body;

    if (!scheduleData || !Array.isArray(scheduleData) || scheduleData.length === 0) {
      return res.status(400).json({ error: "No se enviaron datos de turnos" });
    }

    console.log("📊 Generando archivos Excel...");

    // 1. Generar Excel en memoria (Buffer)
    const formatoBuffer = await generateFormatoTurnos(scheduleData, metadata);
    const plantillaBuffer = await generatePlantillaPrometeo(scheduleData, metadata);

    // 2. Subir a Supabase Storage
    console.log("📤 Subiendo archivos Excel a Supabase Storage...");

    const formatoTurnosPath = await subirExcel(
      formatoBuffer,
      "Formato_Turnos_Programados.xlsx"
    );

    const plantillaPrometeoPath = await subirExcel(
      plantillaBuffer,
      "Plantilla_Programacion_Turnos_Prometeo.xlsx"
    );

    // 3. Calcular estadísticas
    const agentes = new Set(scheduleData.map((t) => t.cedula)).size;
    const descansos = scheduleData.filter((t) => t.esDescanso).length;
    const splits = scheduleData.filter((t) => t.esSplit).length;

    const stats = {
      agentes,
      total: scheduleData.length,
      descansos,
      splits,
    };

    // 4. Guardar en historial
    const analisisGuardado = await guardarAnalisis({
      metadata,
      imagenesPaths: imagenesPaths || [],
      formatoTurnosPath,
      plantillaPrometeoPath,
      stats,
    });

    console.log("✅ Archivos generados y guardados en Supabase");

    // 5. Obtener URLs públicas para respuesta
    const { obtenerUrlPublica, BUCKETS } = require("../services/supabaseService");

    res.json({
      success: true,
      analisisId: analisisGuardado.id,
      files: {
        formato: obtenerUrlPublica(BUCKETS.EXCELS, formatoTurnosPath),
        plantilla: obtenerUrlPublica(BUCKETS.EXCELS, plantillaPrometeoPath),
      },
    });
  } catch (error) {
    console.error("❌ Error generando Excel:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINTS DE HISTORIAL
// ============================================

/**
 * GET /api/historial
 * Obtiene el historial de análisis
 */
router.get("/historial", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const historial = await obtenerHistorial(limit);

    res.json({ success: true, data: historial });
  } catch (error) {
    console.error("❌ Error obteniendo historial:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/historial/:id
 * Obtiene un análisis específico
 */
router.get("/historial/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const analisis = await obtenerAnalisisPorId(id);

    res.json({ success: true, data: analisis });
  } catch (error) {
    console.error("❌ Error obteniendo análisis:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/historial/:id
 * Elimina un análisis del historial
 */
router.delete("/historial/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await eliminarAnalisis(id);

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error eliminando análisis:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINTS DE AGENTES (CRUD)
// ============================================

/**
 * GET /api/agentes
 * Lista todos los agentes. Query param: ?campana=AVC-ATH
 */
router.get("/agentes", async (req, res) => {
  try {
    const { campana } = req.query;

    let agentes;
    if (campana) {
      agentes = await obtenerAgentesPorCampana(campana);
    } else {
      agentes = await obtenerTodosLosAgentes();
    }

    res.json({ success: true, data: agentes });
  } catch (error) {
    console.error("❌ Error obteniendo agentes:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agentes
 * Crear un nuevo agente
 * Body: { cedula, nombre, campana, supervisor, contrato? }
 */
router.post("/agentes", async (req, res) => {
  try {
    const { cedula, nombre, campana, supervisor, contrato } = req.body;

    if (!cedula || !nombre || !campana || !supervisor) {
      return res.status(400).json({
        error: "Campos requeridos: cedula, nombre, campana, supervisor",
      });
    }

    const agente = await crearAgente({ cedula, nombre, campana, supervisor, contrato });
    console.log(`✅ Agente creado: ${agente.nombre} (${agente.cedula})`);

    res.json({ success: true, data: agente });
  } catch (error) {
    console.error("❌ Error creando agente:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/agentes/:id
 * Actualizar un agente existente
 */
router.put("/agentes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const agente = await actualizarAgente(id, updates);
    console.log(`✅ Agente actualizado: ${agente.nombre}`);

    res.json({ success: true, data: agente });
  } catch (error) {
    console.error("❌ Error actualizando agente:", error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/agentes/:id
 * Desactivar (soft delete) un agente
 */
router.delete("/agentes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await eliminarAgente(id);
    console.log(`✅ Agente desactivado: ${id}`);

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error eliminando agente:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINTS DE ALIAS
// ============================================

/**
 * GET /api/agentes/:id/alias
 * Obtener alias de un agente
 */
router.get("/agentes/:id/alias", async (req, res) => {
  try {
    const { id } = req.params;
    const aliases = await obtenerAliases(id);
    res.json({ success: true, data: aliases });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agentes/:id/alias
 * Agregar un alias a un agente
 * Body: { alias: "nombre parcial" }
 */
router.post("/agentes/:id/alias", async (req, res) => {
  try {
    const { id } = req.params;
    const { alias } = req.body;

    if (!alias) {
      return res.status(400).json({ error: "Se requiere el campo alias" });
    }

    const result = await agregarAlias(id, alias);
    console.log(`✅ Alias agregado: "${alias}" para agente ${id}`);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

/**
 * GET /api/health
 * Verificar estado de conexiones
 */
router.get("/health", async (req, res) => {
  const supabaseStatus = await verificarConexion();

  res.json({
    success: true,
    server: "ok",
    supabase: supabaseStatus,
    anthropic: process.env.ANTHROPIC_API_KEY ? "configured" : "missing",
  });
});

module.exports = router;