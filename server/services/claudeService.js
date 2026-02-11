const Anthropic = require("@anthropic-ai/sdk");
const { enriquecerTurnos } = require("./supabaseService");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analiza una o múltiples imágenes de maya horaria usando Claude Vision (Opus 4.6 con pensamiento extendido)
 * Extrae: agentes, cédulas, campaña, supervisor, horarios por día, almuerzos
 * Luego enriquece con datos de Supabase (cédulas, nombres completos, etc.)
 */
async function analyzeScheduleImages(images) {
  // images es un array de { base64, mediaType, originalName }

  const systemPrompt = `Eres un experto en análisis de imágenes de mallas horarias (maya horaria) de call centers y centros de operaciones.
Tu tarea es extraer TODA la información de turnos programados de las imágenes con MÁXIMA precisión.

CONTEXTO IMPORTANTE:
- Estas son mayas horarias de un call center en Colombia
- La semana va del 9 al 15 de febrero de 2026 (Lunes 9 a Domingo 15)
- Los días se muestran como columnas: 9/L, 10/M, 11/M, 12/J, 13/V, 14/S, 15/D
- Puede haber MÚLTIPLES imágenes, cada una con una campaña/cuenta diferente
- Las campañas posibles incluyen: CORFICOLOMBIANA, AVC, AVC-ATH, etc.

=== ESTRUCTURA DE LA MAYA HORARIA ===

La maya tiene DOS secciones principales. Cada sección tiene:
- Columnas de DATOS BASE a la izquierda (CUENTA, TAREAS ASIGNADAS, Agente, Ingreso, Salida, Almuerzo, Break Mañana, Break Tarde)
- Columnas de DÍAS a la derecha bajo "Horario Provisional" (9/L, 10/M, 11/M, 12/J, 13/V, 14/S, 15/D)

**SECCIÓN 1: TURNOS REGULARES (parte superior)**

Cada FILA define un PERFIL de horario con:
- CUENTA: campaña (CORFICOLOMBIANA, AVC, etc.)
- TAREAS ASIGNADAS: la tarea
- Agente: puede estar en una columna dedicada O aparecer solo en las columnas de días
- Ingreso: hora de INICIO base (ej: 7:00 AM, 7:42 AM) — aplica de Lunes a Viernes
- Salida: hora de FIN base (ej: 5:18 PM, 6:00 PM) — aplica de Lunes a Viernes
- Almuerzo: rango (ej: 12:00 - 1:00, 1:00 - 2:00) — aplica de Lunes a Viernes
- Break Mañana/Break Tarde: IGNORAR para el Excel

REGLA CRÍTICA SOBRE LAS COLUMNAS DE DÍAS:
Las columnas de días muestran el nombre del agente asignado a ESE perfil de horario.

- Si una columna de día (ej: J/12) muestra "Jesus Magallanes" → ese agente trabaja ESE día con el Ingreso/Salida/Almuerzo BASE de esa fila
- Si una columna de día muestra un HORARIO diferente (ej: "6:00 AM - 2:00PM") → es el horario ESPECÍFICO para ese día (reemplaza Ingreso/Salida base). Esto típicamente ocurre en Sábado (S/14) y Domingo (D/15)
- Si una columna de día está VACÍA para una fila → ese perfil NO tiene agente asignado ese día

REGLA IMPORTANTÍSIMA - LUNES A VIERNES:
En la mayoría de mayas, las columnas L(9) a V(13) muestran el NOMBRE del agente que trabaja con ese perfil de horario. Si ves un nombre en las columnas de L a V, ESE agente trabaja TODOS esos días con el horario base (Ingreso/Salida).

A veces el nombre aparece en una sola columna (ej: solo en J/12) pero esto puede significar que el nombre está "expandido" visualmente a lo largo de toda la franja L-V. Analiza visualmente si el nombre parece abarcar varias columnas de días.

Si un agente aparece en la columna Agente o en las columnas de días L-V:
→ Trabaja TODOS los días L-V con el horario base de esa fila
→ EXCEPTO si S o D tienen un horario diferente o están vacíos

REGLA PARA SÁBADO Y DOMINGO (columnas S/14, D/15):
- Si muestran un horario específico (ej: "6:00 AM - 2:00PM") → es turno normal con ese horario (NO split), SIN almuerzo
- Si están vacíos → es DESCANSO ese día
- Si muestran "Descanso" → es DESCANSO

**SECCIÓN 2: TURNO PARTIDO (parte inferior, si existe)**

Esta sección define turnos SPLIT (divididos) con DOS franjas horarias separadas:
- Turno Mañana: primera franja (ej: 6:00 AM - 10:00 AM)  
- Turno Tarde/Noche: segunda franja (ej: 5:00 PM - 10:00 PM)

Las columnas de días en esta sección:
- Si muestran un nombre de agente → ese agente trabaja ESE día con turno SPLIT (ambas franjas base)
- Si muestran un horario modificado (ej: "5:30 PM - 10:00 PM") → SOLO la franja de la TARDE cambia, la mañana sigue igual. Es SPLIT.
- Columnas S(14) y D(15) en turno partido: Si muestran un rango horario continuo (ej: "2:00 PM - 10:00 PM" o "6:00 AM - 2:00 PM"), este es un turno CONTINUO (NO split). Es turno normal sin almuerzo.

Nota: "Eliana pooling 7:00 am - 9:00am" o textos similares en la columna "Agente" de la sección regular que parecen ser textos de apoyo/soporte y NO un agente con turno regular NO deben incluirse como agente. Si dice "Apoyo línea Eliana de 7:00 am - 9:00 am", esto es una NOTA, no un agente con turno asignado.

=== CÓMO DETERMINAR EL HORARIO DE CADA AGENTE ===

Paso 1: Identifica TODOS los agentes reales en las imágenes (nombres en columnas Agente o en columnas de días)
Paso 2: Para cada agente, determina en QUÉ sección aparece y QUÉ días:

CASO A - Agente en SECCIÓN REGULAR (turnos normales):
- Días L(9) a V(13): Trabaja con el horario BASE (Ingreso/Salida/Almuerzo) de su fila
- S(14): Si hay horario específico → turno normal con ese horario. Si vacío → Descanso
- D(15): Si hay horario específico → turno normal con ese horario. Si vacío → Descanso

CASO B - Agente en SECCIÓN TURNO PARTIDO:
- Los días donde aparece su nombre o "Turno partido" → SPLIT con franjas base (Turno Mañana + Turno Tarde)
- Si una columna de día muestra horario modificado (ej: "5:30 PM - 10:00 PM") → SPLIT con mañana base + tarde modificada
- S(14) y D(15) con horario continuo → turno NORMAL (no split), sin almuerzo

CASO C - Agente que NO aparece en NINGUNA sección para un día:
- Ese día es DESCANSO

=== FORMATO DE SALIDA ===

DEBES responder ÚNICAMENTE con un JSON válido (sin markdown, sin backticks, sin texto adicional).

{
  "metadata": {
    "supervisor": "Nombre del supervisor/líder si es visible, o null",
    "campanas": ["lista de campañas encontradas"],
    "semana": "del 9 al 15 de febrero",
    "fechaInicio": "2026-02-09",
    "fechaFin": "2026-02-15"
  },
  "agentes": [
    {
      "nombre": "NOMBRE COMPLETO EN MAYÚSCULAS tal como aparece",
      "campana": "campaña a la que pertenece",
      "tareaAsignada": "tarea asignada si es visible"
    }
  ],
  "turnos": [
    {
      "cedula": "???",
      "nombre": "NOMBRE DEL AGENTE",
      "fecha": "2026-02-09",
      "diaSemana": "Lunes",
      "horaInicio": "06:00",
      "horaFin": "10:00",
      "esDescanso": false,
      "esSplit": true,
      "splitHoraInicio2": "17:00",
      "splitHoraFin2": "22:00",
      "almuerzo": null,
      "campana": "CORFICOLOMBIANA",
      "jornada": "06:00 - 10:00 // 17:00 - 22:00"
    }
  ]
}

=== REGLAS DE FORMATO ===

1. Horas en formato 24h (HH:MM): "7:00 AM" → "07:00", "5:18 PM" → "17:18", "6:00 PM" → "18:00", "10:00 PM" → "22:00", "5:30 PM" → "17:30", "2:00 PM" → "14:00"
2. Descanso: esDescanso=true, horaInicio=null, horaFin=null, jornada="DESCANSO"
3. Turno split: esSplit=true, horaInicio/horaFin para primera franja, splitHoraInicio2/splitHoraFin2 para segunda franja, almuerzo=null
4. Turno normal: esSplit=false, horaInicio y horaFin normales, almuerzo con formato "HH:MM - HH:MM" en 24h
5. Jornada split: "06:00 - 10:00 // 17:00 - 22:00"
6. Jornada normal con almuerzo: "07:42 - 18:00 D 1h" (D Xh = duración almuerzo)
7. Jornada fin de semana sin almuerzo: "14:00 - 22:00" o "06:00 - 14:00" (sin D)
8. CADA agente = EXACTAMENTE 7 registros (uno por cada día del 9 al 15)
9. Si no puedes leer un dato: usa "???"
10. Nombres en MAYÚSCULAS
11. Cédula siempre "???" (se completa desde BD)
12. Fechas: 2026-02-09 (Lun), 2026-02-10 (Mar), 2026-02-11 (Mié), 2026-02-12 (Jue), 2026-02-13 (Vie), 2026-02-14 (Sáb), 2026-02-15 (Dom)
13. Si S o D en turno partido muestra horario continuo (ej: "2:00 PM - 10:00 PM"), ese turno NO es split, es normal (esSplit=false)
14. Almuerzo para turnos de fin de semana de 8 horas o menos: null (no aplica)
15. NO incluir notas de apoyo como agentes (ej: "Apoyo línea Eliana" no es un agente)
16. Los agentes en la sección regular trabajan L-V con su horario base a menos que se indique lo contrario`;

  // Construir el contenido del mensaje con todas las imágenes
  const messageContent = [];

  for (let i = 0; i < images.length; i++) {
    messageContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: images[i].mediaType,
        data: images[i].base64,
      },
    });
    messageContent.push({
      type: "text",
      text: `[Imagen ${i + 1}${images[i].originalName ? ` - ${images[i].originalName}` : ""}]`,
    });
  }

  messageContent.push({
    type: "text",
    text: `Analiza ${images.length > 1 ? "TODAS estas imágenes" : "esta imagen"} de maya horaria/malla de turnos. Extrae TODA la información de los turnos programados para CADA agente y CADA día visible (del 9 al 15 de febrero de 2026).

${images.length > 1 ? "IMPORTANTE: Cada imagen puede contener una campaña diferente. Extrae los agentes y turnos de TODAS las imágenes y combínalos en un solo resultado." : ""}

PROCESO PASO A PASO:
1. Identifica TODAS las campañas/cuentas visibles en las imágenes
2. Para cada campaña, lee PRIMERO la sección de turnos regulares:
   - Identifica cada fila con su Ingreso, Salida, Almuerzo
   - Mira las columnas de días (9-15): el nombre del agente que aparece indica QUIÉN usa ese perfil
   - CLAVE: Si un agente aparece en la columna de un día (o su nombre abarca las columnas L-V), ese agente trabaja L-V con el horario base
   - Las columnas S(14) y D(15) pueden tener horarios diferentes o estar vacías (=Descanso)
3. Lee la sección TURNO PARTIDO (si existe):
   - Identifica Turno Mañana y Turno Tarde/Noche
   - Lee las columnas de días para ver qué agente trabaja qué día con split
   - J(12) y V(13) pueden mostrar horarios modificados para la franja tarde (ej: "5:30 PM - 10:00 PM")
   - S(14) y D(15) pueden ser turnos CONTINUOS (no split)
4. Para cada agente encontrado, genera EXACTAMENTE 7 registros (L9 a D15)

REGLA FUNDAMENTAL: Si un agente aparece asignado a un perfil de horario regular, trabaja L-V con el horario base (Ingreso/Salida/Almuerzo) de esa fila. NO pongas Descanso de Lunes a Viernes a menos que la imagen explícitamente indique que no trabaja esos días.

NO incluyas como agentes las notas de apoyo (ej: "Apoyo línea Eliana de 7:00 am - 9:00 am" no es un agente con turno asignado).

IMPORTANTE: Responde SOLO con el JSON, sin ningún texto adicional, sin backticks de markdown.`,
  });

  console.log("🧠 Usando Claude Opus 4.6 con pensamiento extendido (streaming)...");

  // Usar streaming para evitar timeout en operaciones largas con Opus 4.6
  const stream = await client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
    messages: [
      {
        role: "user",
        content: messageContent,
      },
    ],
    system: systemPrompt,
  });

  // Recopilar la respuesta completa del stream
  const response = await stream.finalMessage();

  // Extraer el texto de la respuesta (ignorar bloques de pensamiento)
  const responseText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Log thinking summary if available
  const thinkingBlocks = response.content.filter((block) => block.type === "thinking");
  if (thinkingBlocks.length > 0) {
    const thinkingLength = thinkingBlocks.reduce((acc, b) => acc + (b.thinking || "").length, 0);
    console.log(`🧠 Pensamiento extendido: ${thinkingLength} caracteres de razonamiento`);
  }

  // Limpiar posibles backticks de markdown
  let cleanJson = responseText
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsedData;
  try {
    parsedData = JSON.parse(cleanJson);
  } catch (parseError) {
    console.error("Error parseando JSON de Claude:", parseError.message);
    console.error("Respuesta recibida:", responseText.substring(0, 1000));
    throw new Error(
      "No se pudo interpretar la respuesta de Claude. La imagen puede no ser clara o no contener una maya horaria válida."
    );
  }

  // ============================================
  // VALIDACIÓN Y NORMALIZACIÓN POST-PROCESAMIENTO
  // ============================================
  console.log("🔧 Validando y normalizando datos extraídos...");

  if (parsedData.turnos && Array.isArray(parsedData.turnos)) {
    parsedData.turnos = parsedData.turnos.map((turno) => {
      // Normalizar horas a formato 24h
      if (turno.horaInicio) turno.horaInicio = normalizeTime(turno.horaInicio);
      if (turno.horaFin) turno.horaFin = normalizeTime(turno.horaFin);
      if (turno.splitHoraInicio2) turno.splitHoraInicio2 = normalizeTime(turno.splitHoraInicio2);
      if (turno.splitHoraFin2) turno.splitHoraFin2 = normalizeTime(turno.splitHoraFin2);

      // Normalizar almuerzo a formato 24h si tiene AM/PM
      if (turno.almuerzo && typeof turno.almuerzo === "string") {
        turno.almuerzo = normalizeAlmuerzo(turno.almuerzo);
      }

      // Asegurar que fechas usen 2026
      if (turno.fecha && turno.fecha.startsWith("2025-")) {
        turno.fecha = turno.fecha.replace("2025-", "2026-");
      }

      // Normalizar nombre a mayúsculas
      if (turno.nombre) turno.nombre = turno.nombre.toUpperCase();

      // Asegurar campos booleanos
      turno.esDescanso = turno.esDescanso === true;
      turno.esSplit = turno.esSplit === true;

      // Si es descanso, limpiar horas
      if (turno.esDescanso) {
        turno.horaInicio = null;
        turno.horaFin = null;
        turno.almuerzo = null;
        turno.splitHoraInicio2 = null;
        turno.splitHoraFin2 = null;
        turno.esSplit = false;
        turno.jornada = "DESCANSO";
      }

      // Si es split, asegurar que tiene las franjas
      if (turno.esSplit && !turno.esDescanso) {
        turno.almuerzo = null; // Split no tiene almuerzo
        if (!turno.splitHoraInicio2 || !turno.splitHoraFin2) {
          console.warn(`⚠️  Turno split sin segunda franja: ${turno.nombre} ${turno.fecha}`);
        }
      }

      // Construir jornada si no existe o normalizarla
      if (!turno.esDescanso) {
        if (turno.esSplit && turno.splitHoraInicio2 && turno.splitHoraFin2) {
          turno.jornada = `${turno.horaInicio} - ${turno.horaFin} // ${turno.splitHoraInicio2} - ${turno.splitHoraFin2}`;
        } else if (turno.horaInicio && turno.horaFin) {
          turno.jornada = `${turno.horaInicio} - ${turno.horaFin}`;
          if (turno.almuerzo && turno.almuerzo !== "null" && turno.almuerzo !== "n/a") {
            const duracion = calcularDuracionAlmuerzo(turno.almuerzo);
            turno.jornada += ` D ${duracion}`;
          }
        }
      }

      return turno;
    });
  }

  // Normalizar metadata
  if (parsedData.metadata) {
    if (parsedData.metadata.fechaInicio && parsedData.metadata.fechaInicio.startsWith("2025-")) {
      parsedData.metadata.fechaInicio = parsedData.metadata.fechaInicio.replace("2025-", "2026-");
    }
    if (parsedData.metadata.fechaFin && parsedData.metadata.fechaFin.startsWith("2025-")) {
      parsedData.metadata.fechaFin = parsedData.metadata.fechaFin.replace("2025-", "2026-");
    }
  }

  // ============================================
  // ENRIQUECIMIENTO CON SUPABASE
  // ============================================
  console.log("🔗 Cruzando datos con base de datos Supabase...");

  try {
    const enriched = await enriquecerTurnos(
      parsedData.turnos || [],
      parsedData.metadata || {}
    );

    parsedData.turnos = enriched.turnos;
    parsedData.metadata = enriched.metadata;
    parsedData.matchStats = enriched.matchStats;

    console.log(
      `📊 Resultado: ${enriched.matchStats.matched}/${enriched.matchStats.total} agentes identificados desde BD`
    );
  } catch (enrichError) {
    console.warn(
      "⚠️  Error enriqueciendo datos (continuando sin enriquecer):",
      enrichError.message
    );
    parsedData.matchStats = {
      total: parsedData.turnos?.length || 0,
      matched: 0,
      unmatched: parsedData.turnos?.length || 0,
    };
  }

  return parsedData;
}

/**
 * Normaliza una hora a formato HH:MM en 24h
 * Soporta: "7:00 AM", "5:18 PM", "07:42", "17:00", "5:00PM", "6:00 a.m.", etc.
 */
function normalizeTime(timeStr) {
  if (!timeStr || timeStr === "null" || timeStr === "???" || timeStr === "n/a") return null;

  timeStr = String(timeStr).trim();

  // Ya está en formato 24h HH:MM sin AM/PM
  if (/^\d{1,2}:\d{2}$/.test(timeStr) && !timeStr.toLowerCase().includes("m")) {
    const [h, m] = timeStr.split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Tiene AM/PM (soporta variantes: am, pm, a.m., p.m., a. m., p. m.)
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)/i);
  if (match) {
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[4].toLowerCase();

    if (ampm.startsWith("p") && h < 12) h += 12;
    if (ampm.startsWith("a") && h === 12) h = 0;

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Solo HH:MM sin AM/PM
  const simpleMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (simpleMatch) {
    const h = parseInt(simpleMatch[1]);
    const m = parseInt(simpleMatch[2]);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return timeStr;
}

/**
 * Normaliza el string de almuerzo a formato 24h
 * "12:00 - 1:00" → "12:00 - 13:00", "1:00 - 2:00" → "13:00 - 14:00"
 */
function normalizeAlmuerzo(almuerzoStr) {
  if (!almuerzoStr || almuerzoStr === "null" || almuerzoStr === "n/a" || almuerzoStr === "???") return null;

  // Intentar extraer las dos horas del rango
  const match = almuerzoStr.match(
    /(\d{1,2}):(\d{2})\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?/i
  );
  if (!match) return almuerzoStr;

  let h1 = parseInt(match[1]);
  const m1 = parseInt(match[2]);
  const ampm1 = (match[3] || "").toLowerCase();

  let h2 = parseInt(match[4]);
  const m2 = parseInt(match[5]);
  const ampm2 = (match[6] || "").toLowerCase();

  // Aplicar AM/PM si está presente
  if (ampm1.startsWith("p") && h1 < 12) h1 += 12;
  if (ampm1.startsWith("a") && h1 === 12) h1 = 0;
  if (ampm2.startsWith("p") && h2 < 12) h2 += 12;
  if (ampm2.startsWith("a") && h2 === 12) h2 = 0;

  // Si no hay AM/PM, inferir para horas de almuerzo típicas
  if (!ampm1 && !ampm2) {
    // Almuerzos típicos: 11:00-12:00, 12:00-13:00, 13:00-14:00, etc.
    if (h1 >= 1 && h1 <= 6) h1 += 12; // 1:00 → 13:00
    if (h2 >= 1 && h2 <= 6) h2 += 12; // 2:00 → 14:00
  }

  return `${String(h1).padStart(2, "0")}:${String(m1).padStart(2, "0")} - ${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
}

/**
 * Calcular duración del almuerzo desde un string
 */
function calcularDuracionAlmuerzo(almuerzoStr) {
  if (!almuerzoStr) return "1h";

  const match = almuerzoStr.match(
    /(\d{1,2}):(\d{2})\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?/i
  );
  if (!match) return "1h";

  let h1 = parseInt(match[1]);
  const m1 = parseInt(match[2]);
  const ampm1 = (match[3] || "").toLowerCase();

  let h2 = parseInt(match[4]);
  const m2 = parseInt(match[5]);
  const ampm2 = (match[6] || "").toLowerCase();

  if (ampm1.includes("p") && h1 < 12) h1 += 12;
  if (ampm1.includes("a") && h1 === 12) h1 = 0;
  if (ampm2.includes("p") && h2 < 12) h2 += 12;
  if (ampm2.includes("a") && h2 === 12) h2 = 0;

  // Si no hay AM/PM y las horas son bajas, asumir PM para horas 1-6
  if (!ampm1 && !ampm2) {
    if (h1 >= 1 && h1 <= 6 && h2 >= 1 && h2 <= 6) {
      h1 += 12;
      h2 += 12;
    } else if (h1 >= 11 && h2 >= 1 && h2 <= 6) {
      h2 += 12;
    }
  }

  const diffMinutes = h2 * 60 + m2 - (h1 * 60 + m1);
  const hours = Math.abs(diffMinutes) / 60;

  if (hours === 1) return "1h";
  if (hours === 0.5) return "0.5h";
  if (hours === 1.5) return "1.5h";
  return `${hours}h`;
}

module.exports = { analyzeScheduleImages };