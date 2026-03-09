const Anthropic = require("@anthropic-ai/sdk");
const { enriquecerTurnos } = require("./supabaseService");
const { enriquecerLocal } = require("./localAgentsService");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analiza una o múltiples imágenes de maya horaria usando Claude Vision (Sonnet - más económico)
 * Extrae: agentes, cédulas, campaña, supervisor, horarios por día, almuerzos
 * Luego enriquece con datos de Supabase (cédulas, nombres completos, etc.)
 */
async function analyzeScheduleImages(images) {
  // images es un array de { base64, mediaType, originalName }

  // Calcular la fecha actual para contexto dinámico
  const hoy = new Date();
  const mesActual = hoy.getMonth(); // 0-indexed
  const anioActual = hoy.getFullYear();
  const mesesNombres = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  const systemPrompt = `Eres un experto en análisis de imágenes de mallas horarias (maya horaria) de call centers y centros de operaciones.
Tu tarea es extraer TODA la información de turnos programados de las imágenes con MÁXIMA precisión.

CONTEXTO IMPORTANTE:
- Estas son mayas horarias de un call center en Colombia
- La fecha de hoy es ${hoy.toISOString().split("T")[0]} (${mesesNombres[mesActual]} ${anioActual})
- Las campaañas posibles incluyen: CORFICOLOMBIANA, AVC, AVC-ATH, etc.
- Puede haber MÚLTIPLES imágenes, cada una con una campaña/cuenta diferente

=== DETECCIÓN DE FECHAS (MUY IMPORTANTE) ===

Las columnas de días en la maya horaria muestran NÚMEROS que representan el DÍA DEL MES, con una letra debajo indicando el día de la semana:
- L = Lunes, M = Martes, M = Miércoles, J = Jueves, V = Viernes, S = Sábado, D = Domingo

DEBES leer los números exactos de las columnas de la imagen. Por ejemplo:
- Si ves "16, 17, 18, 19, 20, 21, 22" con "L, M, M, J, V, S, D" → es del día 16 al 22
- Si ves "9, 10, 11, 12, 13, 14, 15" con "L, M, M, J, V, S, D" → es del día 9 al 15
- Si ves "23, 24, 25, 26, 27, 28, 1" → cruza de un mes al siguiente

Para determinar el MES y AÑO:
- Si no es explícito en la imagen, usa el mes actual o el mes más cercano donde esos días caigan en esos días de la semana
- La fecha actual es ${hoy.toISOString().split("T")[0]}, así que los turnos probablemente son de ${mesesNombres[mesActual]} ${anioActual} o semanas cercanas

REGLA CRÍTICA: Usa los números REALES que ves en las columnas de la imagen, NO inventes fechas. Calcula las fechas completas (YYYY-MM-DD) a partir de esos números.

=== ESTRUCTURA DE LA MAYA HORARIA ===

La maya tiene DOS secciones principales. Cada sección tiene:
- Columnas de DATOS BASE a la izquierda (CUENTA, TAREAS ASIGNADAS, Agente, Ingreso, Salida, Almuerzo, Break Mañana, Break Tarde)
- Columnas de DÍAS a la derecha bajo "Horario Provisional" (los números de día con letra)

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

- Si una columna de día (ej: J/19) muestra "Jesus Magallanes" → ese agente trabaja ESE día con el Ingreso/Salida/Almuerzo BASE de esa fila
- Si una columna de día muestra un HORARIO diferente (ej: "6:00 AM - 2:00PM") → es el horario ESPECÍFICO para ese día (reemplaza Ingreso/Salida base). Esto típicamente ocurre en Sábado y Domingo
- Si una columna de día está VACÍA para una fila → ese perfil NO tiene agente asignado ese día

REGLA IMPORTANTÍSIMA - LUNES A VIERNES:
En la mayoría de mayas, las columnas L a V muestran el NOMBRE del agente que trabaja con ese perfil de horario. Si ves un nombre en las columnas de L a V, ESE agente trabaja TODOS esos días con el horario base (Ingreso/Salida).

A veces el nombre aparece en una sola columna pero esto puede significar que el nombre está "expandido" visualmente a lo largo de toda la franja L-V. Analiza visualmente si el nombre parece abarcar varias columnas de días.

Si un agente aparece en la columna Agente o en las columnas de días L-V:
→ Trabaja TODOS los días L-V con el horario base de esa fila
→ EXCEPTO si S o D tienen un horario diferente o están vacíos

REGLA PARA SÁBADO Y DOMINGO:
- Si muestran un horario específico (ej: "6:00 AM - 2:00PM") → es turno normal con ese horario (NO split), SIN almuerzo
- Si están vacíos → es DESCANSO ese día
- Si muestran "Descanso" → es DESCANSO

=== MANEJO DE INCAPACIDAD Y OTROS ESTADOS ESPECIALES ===

IMPORTANTE: En las columnas de días pueden aparecer textos especiales en lugar de nombres o horarios:
- "Incapacidad" → El agente está incapacitado ese día (no trabaja, motivo médico)
- "Vacaciones" → El agente está de vacaciones
- "Licencia" → Licencia
- "Permiso" → Permiso
- Cualquier otro texto que NO sea un nombre de agente ni un horario → tratarlo como ausencia con ese motivo

Cuando veas estos estados especiales:
- esDescanso = false (NO es descanso, es una ausencia justificada diferente)
- esIncapacidad = true
- motivoAusencia = el texto exacto que aparece (ej: "Incapacidad", "Vacaciones", etc.)
- horaInicio = null, horaFin = null, almuerzo = null
- jornada = el motivo en mayúsculas (ej: "INCAPACIDAD", "VACACIONES")

Si un agente tiene "Incapacidad" en Lunes y Martes pero trabaja el resto de la semana:
→ Genera 7 registros: 2 con esIncapacidad=true y 5 con su horario normal

**SECCIÓN 2: TURNO PARTIDO (parte inferior, si existe)**

Esta sección define turnos SPLIT (divididos) con DOS franjas horarias separadas:
- Turno Mañana: primera franja (ej: 6:00 AM - 10:00 AM)  
- Turno Tarde/Noche: segunda franja (ej: 5:00 PM - 10:00 PM)

Las columnas de días en esta sección:
- Si muestran un nombre de agente → ese agente trabaja ESE día con turno SPLIT (ambas franjas base)
- Si muestran un horario modificado (ej: "5:30 PM - 10:00 PM") → SOLO la franja de la TARDE cambia, la mañana sigue igual. Es SPLIT.
- Columnas S y D en turno partido: Si muestran un rango horario continuo (ej: "2:00 PM - 10:00 PM" o "6:00 AM - 2:00 PM"), este es un turno CONTINUO (NO split). Es turno normal sin almuerzo.

Nota: "Eliana pooling 7:00 am - 9:00am" o textos similares en la columna "Agente" de la sección regular que parecen ser textos de apoyo/soporte y NO un agente con turno regular NO deben incluirse como agente.

=== CÓMO DETERMINAR EL HORARIO DE CADA AGENTE ===

Paso 1: Identifica TODOS los agentes reales en las imágenes (nombres en columnas Agente o en columnas de días)
Paso 2: Para cada agente, determina en QUÉ sección aparece y QUÉ días:

CASO A - Agente en SECCIÓN REGULAR (turnos normales):
- Días L a V: Trabaja con el horario BASE (Ingreso/Salida/Almuerzo) de su fila
- S: Si hay horario específico → turno normal con ese horario. Si vacío → Descanso
- D: Si hay horario específico → turno normal con ese horario. Si vacío → Descanso
- Si un día muestra "Incapacidad" u otro estado → marcar como ausencia con ese motivo

CASO B - Agente en SECCIÓN TURNO PARTIDO:
- Los días donde aparece su nombre o "Turno partido" → SPLIT con franjas base (Turno Mañana + Turno Tarde)
- Si una columna de día muestra horario modificado (ej: "5:30 PM - 10:00 PM") → SPLIT con mañana base + tarde modificada
- S y D con horario continuo → turno NORMAL (no split), sin almuerzo

CASO C - Agente que NO aparece en NINGUNA sección para un día:
- Ese día es DESCANSO

=== FORMATO DE SALIDA ===

DEBES responder ÚNICAMENTE con un JSON válido (sin markdown, sin backticks, sin texto adicional).

{
  "metadata": {
    "supervisor": "Nombre del supervisor/líder si es visible, o null",
    "campanas": ["lista de campañas encontradas"],
    "semana": "del X al Y de mes",
    "fechaInicio": "YYYY-MM-DD",
    "fechaFin": "YYYY-MM-DD",
    "diasDetectados": [16, 17, 18, 19, 20, 21, 22]
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
      "fecha": "YYYY-MM-DD",
      "diaSemana": "Lunes",
      "horaInicio": "06:00",
      "horaFin": "10:00",
      "esDescanso": false,
      "esIncapacidad": false,
      "motivoAusencia": null,
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
2. Descanso: esDescanso=true, esIncapacidad=false, motivoAusencia=null, horaInicio=null, horaFin=null, jornada="DESCANSO"
3. Incapacidad/ausencia: esDescanso=false, esIncapacidad=true, motivoAusencia="Incapacidad" (o el motivo real), horaInicio=null, horaFin=null, jornada="INCAPACIDAD"
4. Turno split: esSplit=true, horaInicio/horaFin para primera franja, splitHoraInicio2/splitHoraFin2 para segunda franja, almuerzo=null
5. Turno normal: esSplit=false, horaInicio y horaFin normales, almuerzo con formato "HH:MM - HH:MM" en 24h
6. Jornada split: "06:00 - 10:00 // 17:00 - 22:00"
7. Jornada normal con almuerzo: "07:42 - 18:00 D 1h" (D Xh = duración almuerzo)
8. Jornada fin de semana sin almuerzo: "14:00 - 22:00" o "06:00 - 14:00" (sin D)
9. CADA agente = EXACTAMENTE 7 registros (uno por cada día de la semana detectado)
10. Si no puedes leer un dato: usa "???"
11. Nombres en MAYÚSCULAS
12. Cédula siempre "???" (se completa desde BD)
13. Las FECHAS deben calcularse a partir de los números de día visibles en las columnas de la imagen y el mes/año actual
14. Si S o D en turno partido muestra horario continuo (ej: "2:00 PM - 10:00 PM"), ese turno NO es split, es normal (esSplit=false)
15. Almuerzo para turnos de fin de semana de 8 horas o menos: null (no aplica)
16. NO incluir notas de apoyo como agentes (ej: "Apoyo línea Eliana" no es un agente con turno asignado)
17. Los agentes en la sección regular trabajan L-V con su horario base a menos que se indique lo contrario
18. Para estados como Incapacidad: esIncapacidad=true, motivoAusencia="Incapacidad", esDescanso=false`;

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
    text: `Analiza ${images.length > 1 ? "TODAS estas imágenes" : "esta imagen"} de maya horaria/malla de turnos. Extrae TODA la información de los turnos programados para CADA agente y CADA día visible.

FECHA DE HOY: ${hoy.toISOString().split("T")[0]}

${images.length > 1 ? "IMPORTANTE: Cada imagen puede contener una campaña diferente. Extrae los agentes y turnos de TODAS las imágenes y combínalos en un solo resultado." : ""}

PROCESO PASO A PASO:
1. PRIMERO: Lee los NÚMEROS de las columnas de días (ej: 16, 17, 18, 19, 20, 21, 22) y las letras de día de la semana (L, M, M, J, V, S, D). Esto te da el rango de fechas exacto.
2. Calcula las fechas completas YYYY-MM-DD usando esos números y el mes/año actual (${mesesNombres[mesActual]} ${anioActual}).
3. Identifica TODAS las campañas/cuentas visibles en las imágenes.
4. Para cada campaña, lee PRIMERO la sección de turnos regulares:
   - Identifica cada fila con su Ingreso, Salida, Almuerzo
   - Mira las columnas de días: el nombre del agente que aparece indica QUIÉN usa ese perfil
   - CLAVE: Si un agente aparece en la columna de un día (o su nombre abarca las columnas L-V), ese agente trabaja L-V con el horario base
   - Las columnas S y D pueden tener horarios diferentes o estar vacías (=Descanso)
   - ATENCIÓN: Si una columna muestra "Incapacidad", "Vacaciones" u otro estado especial → marcar como ausencia
5. Lee la sección TURNO PARTIDO (si existe):
   - Identifica Turno Mañana y Turno Tarde/Noche
   - Lee las columnas de días para ver qué agente trabaja qué día con split
   - Columnas con horarios modificados para la franja tarde
   - S y D pueden ser turnos CONTINUOS (no split)
6. Para cada agente encontrado, genera EXACTAMENTE 7 registros (uno por cada día de la semana)

REGLA FUNDAMENTAL: Si un agente aparece asignado a un perfil de horario regular, trabaja L-V con el horario base (Ingreso/Salida/Almuerzo) de esa fila. NO pongas Descanso de Lunes a Viernes a menos que la imagen explícitamente indique que no trabaja esos días.

MANEJO DE INCAPACIDAD: Si ves "Incapacidad" en alguna columna de día para un agente, ese día marca: esIncapacidad=true, motivoAusencia="Incapacidad", esDescanso=false, jornada="INCAPACIDAD". Los demás días del agente que SÍ trabaja deben tener su horario normal.

NO incluyas como agentes las notas de apoyo (ej: "Apoyo línea Eliana de 7:00 am - 9:00 am" no es un agente con turno asignado).

IMPORTANTE: Responde SOLO con el JSON, sin ningún texto adicional, sin backticks de markdown.`,
  });

  console.log("🧠 Usando Claude Sonnet (optimizado para reducir costos)...");

  // Usar Sonnet en lugar de Opus para reducir costos significativamente
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: messageContent,
      },
    ],
    system: systemPrompt,
  });

  // Extraer el texto de la respuesta
  const responseText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Log token usage
  if (response.usage) {
    console.log(`📊 Tokens usados: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);
    const costEstimate = ((response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000).toFixed(4);
    console.log(`💰 Costo estimado: ~$${costEstimate} USD`);
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
    console.error("Longitud de respuesta:", responseText.length);
    console.error("Primeros 500 chars:", responseText.substring(0, 500));
    console.error("Últimos 500 chars:", responseText.substring(responseText.length - 500));

    // Intentar recuperar JSON truncado agregando cierre
    try {
      console.log("🔧 Intentando recuperar JSON truncado...");
      const recovered = recoverTruncatedJson(cleanJson);
      parsedData = JSON.parse(recovered);
      console.log("✅ JSON recuperado exitosamente");
    } catch (recoverError) {
      console.error("❌ No se pudo recuperar el JSON:", recoverError.message);
      throw new Error(
        "No se pudo interpretar la respuesta de Claude. La imagen puede no ser clara o no contener una maya horaria válida. Detalles: " +
        parseError.message
      );
    }
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

      // Normalizar nombre a mayúsculas
      if (turno.nombre) turno.nombre = turno.nombre.toUpperCase();

      // Asegurar campos booleanos
      turno.esDescanso = turno.esDescanso === true;
      turno.esSplit = turno.esSplit === true;
      turno.esIncapacidad = turno.esIncapacidad === true;

      // Manejar incapacidad y otros motivos de ausencia
      if (turno.esIncapacidad || (turno.motivoAusencia && turno.motivoAusencia !== null)) {
        turno.esIncapacidad = true;
        turno.motivoAusencia = turno.motivoAusencia || "Incapacidad";
        turno.horaInicio = null;
        turno.horaFin = null;
        turno.almuerzo = null;
        turno.splitHoraInicio2 = null;
        turno.splitHoraFin2 = null;
        turno.esSplit = false;
        turno.esDescanso = false;
        turno.jornada = turno.motivoAusencia.toUpperCase();
      }

      // Si es descanso, limpiar horas
      if (turno.esDescanso) {
        turno.horaInicio = null;
        turno.horaFin = null;
        turno.almuerzo = null;
        turno.splitHoraInicio2 = null;
        turno.splitHoraFin2 = null;
        turno.esSplit = false;
        turno.esIncapacidad = false;
        turno.motivoAusencia = null;
        turno.jornada = "DESCANSO";
      }

      // Si es split, asegurar que tiene las franjas
      if (turno.esSplit && !turno.esDescanso && !turno.esIncapacidad) {
        turno.almuerzo = null; // Split no tiene almuerzo
        if (!turno.splitHoraInicio2 || !turno.splitHoraFin2) {
          console.warn(`⚠️  Turno split sin segunda franja: ${turno.nombre} ${turno.fecha}`);
        }
      }

      // Construir jornada si no existe o normalizarla
      if (!turno.esDescanso && !turno.esIncapacidad) {
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

  // ============================================
  // ENRIQUECIMIENTO: Supabase → fallback local M_Excel
  // ============================================

  let enriched = null;

  // 1. Intentar Supabase
  try {
    console.log("🔗 Cruzando datos con base de datos Supabase...");
    enriched = await enriquecerTurnos(
      parsedData.turnos || [],
      parsedData.metadata || {}
    );
    console.log(
      `📊 Resultado Supabase: ${enriched.matchStats.matched}/${enriched.matchStats.total} agentes identificados`
    );
  } catch (supabaseError) {
    console.warn(
      "⚠️  Supabase no disponible, usando catálogo local M_Excel...",
      supabaseError.message
    );
  }

  // 2. Si Supabase falló o no completó todos los agentes, usar catálogo local
  if (!enriched || enriched.matchStats.matched === 0) {
    try {
      enriched = await enriquecerLocal(
        parsedData.turnos || [],
        parsedData.metadata || {}
      );
    } catch (localError) {
      console.warn("⚠️  Error en enriquecimiento local:", localError.message);
      enriched = {
        turnos: parsedData.turnos || [],
        metadata: parsedData.metadata || {},
        matchStats: {
          total: parsedData.turnos?.length || 0,
          matched: 0,
          unmatched: parsedData.turnos?.length || 0,
        },
      };
    }
  } else if (enriched.matchStats.unmatched > 0) {
    // Supabase completó parcialmente → completar faltantes con catálogo local
    try {
      const localEnriched = await enriquecerLocal(enriched.turnos, enriched.metadata);
      enriched.turnos = localEnriched.turnos;
      const totalMatched = enriched.matchStats.matched + localEnriched.matchStats.matched;
      enriched.matchStats = { ...enriched.matchStats, matched: totalMatched };
      console.log(`📊 Tras catálogo local: ${totalMatched}/${enriched.matchStats.total} total identificados`);
    } catch (e) {
      // Ignorar, quedarse con lo de Supabase
    }
  }

  parsedData.turnos = enriched.turnos;
  parsedData.metadata = enriched.metadata;
  parsedData.matchStats = enriched.matchStats;

  return parsedData;
}

/**
 * Intenta recuperar un JSON truncado cerrando las estructuras abiertas
 */
function recoverTruncatedJson(jsonStr) {
  // Contar brackets y braces abiertos
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") braces++;
    if (char === "}") braces--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
  }

  // Si estamos dentro de un string, cerrarlo
  let recovered = jsonStr;
  if (inString) {
    recovered += '"';
  }

  // Buscar el último turno completo y truncar ahí si estamos en medio de un objeto
  const lastCompleteObject = recovered.lastIndexOf("},");
  if (lastCompleteObject > 0 && (braces > 0 || brackets > 0)) {
    // Truncar después del último objeto completo en el array de turnos
    recovered = recovered.substring(0, lastCompleteObject + 1);
    // Cerrar el array y el objeto padre
    recovered += "]}";
  } else {
    // Cerrar brackets y braces pendientes
    while (brackets > 0) {
      recovered += "]";
      brackets--;
    }
    while (braces > 0) {
      recovered += "}";
      braces--;
    }
  }

  return recovered;
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

  // Descartar placeholders literales que no contienen dígitos reales
  if (!/\d/.test(almuerzoStr)) return null;

  // Intentar extraer las dos horas del rango
  const match = almuerzoStr.match(
    /(\d{1,2}):(\d{2})\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?)?/i
  );
  if (!match) return null;

  let h1 = parseInt(match[1]);
  const m1 = parseInt(match[2]);
  const ampm1 = (match[3] || "").toLowerCase();

  let h2 = parseInt(match[4]);
  const m2 = parseInt(match[5]);
  const ampm2 = (match[6] || "").toLowerCase();

  if (ampm1.startsWith("p") && h1 < 12) h1 += 12;
  if (ampm1.startsWith("a") && h1 === 12) h1 = 0;
  if (ampm2.startsWith("p") && h2 < 12) h2 += 12;
  if (ampm2.startsWith("a") && h2 === 12) h2 = 0;

  if (!ampm1 && !ampm2) {
    if (h1 >= 1 && h1 <= 6) h1 += 12;
    if (h2 >= 1 && h2 <= 6) h2 += 12;
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