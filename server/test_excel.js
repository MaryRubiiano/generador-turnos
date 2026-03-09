/**
 * test_excel.js - Genera los Excel con los datos exactos de la referencia
 * (semana del 2 al 8 de febrero 2026, tal como aparece en CORFI1 + AVC1)
 */
const path = require("path");
const fs = require("fs");

if (fs.existsSync(path.join(__dirname, ".env.local"))) {
  require("dotenv").config({ path: path.join(__dirname, ".env.local") });
}

const { generateFormatoTurnos, generatePlantillaPrometeo } = require("./services/excelService");

// ============================================================
// DATOS EXACTOS del archivo de referencia PLANTILLA PROMETEO
// "del 2 al 8 de febrero" → corresponde a imágenes CORFI1 + AVC1
// Supervisor/Lider completo: MARY LUZ RUBIANO PACHON
// ============================================================

const LIDER = "MARY LUZ RUBIANO PACHON";

const metadata = {
  campana:    "Mixta",     // CORFI + AVC mezclados
  supervisor: LIDER,
  lider:      LIDER,
};

// Datos completos extraídos del Prometeo de referencia
// c1=cedula, nb=nombre(TitleCase), NC=_nombreCompleto(CAPS), ct=contrato, jornada, fecha, esDescanso, esSplit
// Para Formato Turnos también necesitamos: horaInicio, horaFin, almuerzo, campana

const turnosBrutos = [
  // ──────────── CRISTIAN MATEO PATAQUIVA BELLO ────────────
  // Jornada referencia: L=07:30-17:48 D1h, M-V=07:00-17:18 D1h, S=06:00-14:00, D=14:00-22:00
  { cedula:"1007565415", nombre:"Cristian  Mateo  Pataquiva Bello", _nombreCompleto:"CRISTIAN MATEO PATAQUIVA BELLO",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-02", horaInicio:"07:30", horaFin:"17:48", almuerzo:"12:00 - 13:00",
    jornada:"07:30 - 17:48 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1007565415", nombre:"Cristian  Mateo  Pataquiva Bello", _nombreCompleto:"CRISTIAN MATEO PATAQUIVA BELLO",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-03", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"07:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1007565415", nombre:"Cristian  Mateo  Pataquiva Bello", _nombreCompleto:"CRISTIAN MATEO PATAQUIVA BELLO",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-04", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"07:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1007565415", nombre:"Cristian  Mateo  Pataquiva Bello", _nombreCompleto:"CRISTIAN MATEO PATAQUIVA BELLO",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-05", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"07:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1007565415", nombre:"Cristian  Mateo  Pataquiva Bello", _nombreCompleto:"CRISTIAN MATEO PATAQUIVA BELLO",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-06", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"07:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1007565415", nombre:"Cristian  Mateo  Pataquiva Bello", _nombreCompleto:"CRISTIAN MATEO PATAQUIVA BELLO",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-07", horaInicio:"06:00", horaFin:"14:00", almuerzo:null,
    jornada:"06:00 - 14:00", esDescanso:false, esSplit:false },
  { cedula:"1007565415", nombre:"Cristian  Mateo  Pataquiva Bello", _nombreCompleto:"CRISTIAN MATEO PATAQUIVA BELLO",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-08", horaInicio:"14:00", horaFin:"22:00", almuerzo:null,
    jornada:"14:00 - 22:00", esDescanso:false, esSplit:false },

  // ──────────── LEX LILIANA RIOS VELASQUEZ ────────────
  // L-V = 07:42-18:00 D1h, S+D = DESCANSO
  { cedula:"1192831972", nombre:"Lex Liliana Rios", _nombreCompleto:"LEX LILIANA RIOS VELASQUEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-02", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"07:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1192831972", nombre:"Lex Liliana Rios", _nombreCompleto:"LEX LILIANA RIOS VELASQUEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-03", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"07:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1192831972", nombre:"Lex Liliana Rios", _nombreCompleto:"LEX LILIANA RIOS VELASQUEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-04", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"07:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1192831972", nombre:"Lex Liliana Rios", _nombreCompleto:"LEX LILIANA RIOS VELASQUEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-05", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"07:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1192831972", nombre:"Lex Liliana Rios", _nombreCompleto:"LEX LILIANA RIOS VELASQUEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-06", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"07:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1192831972", nombre:"Lex Liliana Rios", _nombreCompleto:"LEX LILIANA RIOS VELASQUEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-07", horaInicio:null, horaFin:null, almuerzo:null,
    jornada:"DESCANSO", esDescanso:true, esSplit:false },
  { cedula:"1192831972", nombre:"Lex Liliana Rios", _nombreCompleto:"LEX LILIANA RIOS VELASQUEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-08", horaInicio:null, horaFin:null, almuerzo:null,
    jornada:"DESCANSO", esDescanso:true, esSplit:false },

  // ──────────── MARCIAL DE JESUS MAGALLANES LOPEZ ────────────
  // L-M = 06:00-10:00//17:00-22:00, J-V = 06:00-10:00//17:30-22:00, S=14:00-22:00, D=06:00-14:00
  { cedula:"1052040123", nombre:"Marcial de Jesus Magallanes", _nombreCompleto:"MARCIAL DE JESUS MAGALLANES LOPEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-02", horaInicio:"06:00", horaFin:"10:00", splitHoraInicio2:"17:00", splitHoraFin2:"22:00", almuerzo:null,
    jornada:"06:00 - 10:00 // 17:00 - 22:00", esDescanso:false, esSplit:true },
  { cedula:"1052040123", nombre:"Marcial de Jesus Magallanes", _nombreCompleto:"MARCIAL DE JESUS MAGALLANES LOPEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-03", horaInicio:"06:00", horaFin:"10:00", splitHoraInicio2:"17:00", splitHoraFin2:"22:00", almuerzo:null,
    jornada:"06:00 - 10:00 // 17:00 - 22:00", esDescanso:false, esSplit:true },
  { cedula:"1052040123", nombre:"Marcial de Jesus Magallanes", _nombreCompleto:"MARCIAL DE JESUS MAGALLANES LOPEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-04", horaInicio:"06:00", horaFin:"10:00", splitHoraInicio2:"17:00", splitHoraFin2:"22:00", almuerzo:null,
    jornada:"06:00 - 10:00 // 17:00 - 22:00", esDescanso:false, esSplit:true },
  { cedula:"1052040123", nombre:"Marcial de Jesus Magallanes", _nombreCompleto:"MARCIAL DE JESUS MAGALLANES LOPEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-05", horaInicio:"06:00", horaFin:"10:00", splitHoraInicio2:"17:30", splitHoraFin2:"22:00", almuerzo:null,
    jornada:"06:00 - 10:00 // 17:30 - 22:00", esDescanso:false, esSplit:true },
  { cedula:"1052040123", nombre:"Marcial de Jesus Magallanes", _nombreCompleto:"MARCIAL DE JESUS MAGALLANES LOPEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-06", horaInicio:"06:00", horaFin:"10:00", splitHoraInicio2:"17:30", splitHoraFin2:"22:00", almuerzo:null,
    jornada:"06:00 - 10:00 // 17:30 - 22:00", esDescanso:false, esSplit:true },
  { cedula:"1052040123", nombre:"Marcial de Jesus Magallanes", _nombreCompleto:"MARCIAL DE JESUS MAGALLANES LOPEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-07", horaInicio:"14:00", horaFin:"22:00", almuerzo:null,
    jornada:"14:00 - 22:00", esDescanso:false, esSplit:false },
  { cedula:"1052040123", nombre:"Marcial de Jesus Magallanes", _nombreCompleto:"MARCIAL DE JESUS MAGALLANES LOPEZ",
    contrato:"U084007810 SET IBM CORFICOLOMBIANA", campana:"Corficolombiana",
    fecha:"2026-02-08", horaInicio:"06:00", horaFin:"14:00", almuerzo:null,
    jornada:"06:00 - 14:00", esDescanso:false, esSplit:false },

  // ──────────── JUAN DAVID ROLDAN MUÑOZ ────────────
  // L-V = 7:42-18:00 D1h, S=DESCANSO, D=14:00-22:00
  { cedula:"1001346822", nombre:"Juan David Roldan", _nombreCompleto:"JUAN DAVID ROLDAN MUÑOZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-02", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"7:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1001346822", nombre:"Juan David Roldan", _nombreCompleto:"JUAN DAVID ROLDAN MUÑOZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-03", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"7:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1001346822", nombre:"Juan David Roldan", _nombreCompleto:"JUAN DAVID ROLDAN MUÑOZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-04", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"7:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1001346822", nombre:"Juan David Roldan", _nombreCompleto:"JUAN DAVID ROLDAN MUÑOZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-05", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"7:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1001346822", nombre:"Juan David Roldan", _nombreCompleto:"JUAN DAVID ROLDAN MUÑOZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-06", horaInicio:"07:42", horaFin:"18:00", almuerzo:"13:00 - 14:00",
    jornada:"7:42 - 18:00 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1001346822", nombre:"Juan David Roldan", _nombreCompleto:"JUAN DAVID ROLDAN MUÑOZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-07", horaInicio:null, horaFin:null, almuerzo:null,
    jornada:"DESCANSO", esDescanso:true, esSplit:false },
  { cedula:"1001346822", nombre:"Juan David Roldan", _nombreCompleto:"JUAN DAVID ROLDAN MUÑOZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-08", horaInicio:"14:00", horaFin:"22:00", almuerzo:null,
    jornada:"14:00 - 22:00", esDescanso:false, esSplit:false },

  // ──────────── GUSTAVO ANDRES SARMIENTO VILLAZON ────────────
  // L-V = 7:00-17:18 D1h, S=DESCANSO, D=14:00-22:00 (según referencia Prometeo)
  { cedula:"1019045162", nombre:"Gustavo Andres Sarmiento", _nombreCompleto:"GUSTAVO ANDRES SARMIENTO VILLAZON",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-02", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1019045162", nombre:"Gustavo Andres Sarmiento", _nombreCompleto:"GUSTAVO ANDRES SARMIENTO VILLAZON",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-03", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1019045162", nombre:"Gustavo Andres Sarmiento", _nombreCompleto:"GUSTAVO ANDRES SARMIENTO VILLAZON",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-04", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1019045162", nombre:"Gustavo Andres Sarmiento", _nombreCompleto:"GUSTAVO ANDRES SARMIENTO VILLAZON",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-05", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1019045162", nombre:"Gustavo Andres Sarmiento", _nombreCompleto:"GUSTAVO ANDRES SARMIENTO VILLAZON",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-06", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1019045162", nombre:"Gustavo Andres Sarmiento", _nombreCompleto:"GUSTAVO ANDRES SARMIENTO VILLAZON",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-07", horaInicio:null, horaFin:null, almuerzo:null,
    jornada:"DESCANSO", esDescanso:true, esSplit:false },
  { cedula:"1019045162", nombre:"Gustavo Andres Sarmiento", _nombreCompleto:"GUSTAVO ANDRES SARMIENTO VILLAZON",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-08", horaInicio:"14:00", horaFin:"22:00", almuerzo:null,
    jornada:"14:00 - 22:00", esDescanso:false, esSplit:false },

  // ──────────── CAMILO ANDRES HURTADO LOPEZ ────────────
  // L-V = 7:00-17:18 D1h, S=06:00-14:00, D=14:00-22:00
  { cedula:"1020795408", nombre:"Camilo Andres Hurtado", _nombreCompleto:"CAMILO ANDRES HURTADO LOPEZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-02", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1020795408", nombre:"Camilo Andres Hurtado", _nombreCompleto:"CAMILO ANDRES HURTADO LOPEZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-03", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1020795408", nombre:"Camilo Andres Hurtado", _nombreCompleto:"CAMILO ANDRES HURTADO LOPEZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-04", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1020795408", nombre:"Camilo Andres Hurtado", _nombreCompleto:"CAMILO ANDRES HURTADO LOPEZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-05", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1020795408", nombre:"Camilo Andres Hurtado", _nombreCompleto:"CAMILO ANDRES HURTADO LOPEZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-06", horaInicio:"07:00", horaFin:"17:18", almuerzo:"12:00 - 13:00",
    jornada:"7:00 - 17:18 D 1h", esDescanso:false, esSplit:false },
  { cedula:"1020795408", nombre:"Camilo Andres Hurtado", _nombreCompleto:"CAMILO ANDRES HURTADO LOPEZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-07", horaInicio:"06:00", horaFin:"14:00", almuerzo:null,
    jornada:"06:00 - 14:00", esDescanso:false, esSplit:false },
  { cedula:"1020795408", nombre:"Camilo Andres Hurtado", _nombreCompleto:"CAMILO ANDRES HURTADO LOPEZ",
    contrato:"U084007810 SET IBM AVC", campana:"AVC-ATH",
    fecha:"2026-02-08", horaInicio:"14:00", horaFin:"22:00", almuerzo:null,
    jornada:"14:00 - 22:00", esDescanso:false, esSplit:false },
];

async function main() {
  try {
    console.log("📄 Generando Formato Turnos Programados...");
    const buf1 = await generateFormatoTurnos(turnosBrutos, metadata);

    console.log("📄 Generando Plantilla Prometeo...");
    const buf2 = await generatePlantillaPrometeo(turnosBrutos, metadata);

    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const ts = Date.now();
    const f1 = path.join(tempDir, `Formato_TEST_${ts}.xlsx`);
    const f2 = path.join(tempDir, `Prometeo_TEST_${ts}.xlsx`);

    fs.writeFileSync(f1, buf1);
    fs.writeFileSync(f2, buf2);

    console.log(`\n✅ Archivos generados:`);
    console.log(`   📁 ${f1} (${(buf1.length/1024).toFixed(1)}KB)`);
    console.log(`   📁 ${f2} (${(buf2.length/1024).toFixed(1)}KB)`);

    // Verificar con ExcelJS leyendo el archivo generado
    const ExcelJS = require("exceljs");

    console.log("\n🔍 Verificando Formato Turnos...");
    const wb1 = new ExcelJS.Workbook();
    await wb1.xlsx.readFile(f1);
    const sh1 = wb1.worksheets[0];
    console.log(`   Hoja: "${sh1.name}", filas: ${sh1.rowCount}`);
    const hdr = sh1.getRow(1);
    const c1 = hdr.getCell(1);
    console.log(`   Header C1: fill=${JSON.stringify(c1.fill?.fgColor)}, font.color=${JSON.stringify(c1.font?.color)}`);
    console.log(`   Header C1 border: ${JSON.stringify(c1.border?.top)}`);
    const d1 = sh1.getRow(2).getCell(1);
    console.log(`   Data R2C1 border: ${JSON.stringify(d1.border?.top)}`);
    const d6 = sh1.getRow(2).getCell(6);
    console.log(`   Data R2C6 (HoraInicio): ${JSON.stringify(d6.value)} numFmt="${d6.numFmt}"`);
    // Verificar split row
    const splitRow = [...Array(sh1.rowCount)].map((_,i)=>sh1.getRow(i+2)).find(r => {
      const v = r.getCell(6).value;
      return typeof v === "string" && v.includes(" - ");
    });
    if (splitRow) {
      console.log(`   Split row C6: "${splitRow.getCell(6).value}"`);
      console.log(`   Split row C7: "${splitRow.getCell(7).value}"`);
    }
    // Verificar descanso row
    const descansoRow = [...Array(sh1.rowCount)].map((_,i)=>sh1.getRow(i+2)).find(r => {
      return r.getCell(6).value === "Descanso";
    });
    console.log(`   Fila Descanso: ${descansoRow ? "SÍ existe" : "NO (correcto si se incluyó)"}`);

    console.log("\n🔍 Verificando Prometeo...");
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(f2);
    console.log(`   Hojas: ${wb2.worksheets.map(s=>`"${s.name}"`).join(", ")}`);
    const sh2 = wb2.worksheets[0];
    console.log(`   Filas: ${sh2.rowCount}`);
    const ph = sh2.getRow(1).getCell(1);
    console.log(`   Header C1: font=${JSON.stringify(ph.font)}, fill=${JSON.stringify(ph.fill?.fgColor)}`);
    const pd = sh2.getRow(2);
    console.log(`   Data R2C1 (cedula): ${pd.getCell(1).value}, align=${JSON.stringify(pd.getCell(1).alignment)}`);
    console.log(`   Data R2C2 (nombre): "${pd.getCell(2).value}"`);
    console.log(`   Data R2C4 (jornada): "${pd.getCell(4).value}"`);
    console.log(`   Data R2C5 (fecha): ${pd.getCell(5).value}, numFmt="${pd.getCell(5).numFmt}"`);
    console.log(`   Data R2C6 (lider): "${pd.getCell(6).value}"`);
    // Buscar DESCANSO
    let descansoCount = 0;
    for (let r = 2; r <= sh2.rowCount; r++) {
      if (sh2.getRow(r).getCell(4).value === "DESCANSO") descansoCount++;
    }
    console.log(`   Filas DESCANSO: ${descansoCount}`);

    console.log("\n✅ Verificación completa.");
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
