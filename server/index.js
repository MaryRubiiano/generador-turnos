const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Cargar variables de entorno (.env.local o .env)
if (fs.existsSync(path.join(__dirname, ".env.local"))) {
  require("dotenv").config({ path: path.join(__dirname, ".env.local") });
} else {
  require("dotenv").config();
}

const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ CORS configurado correctamente
const allowedOrigins = [
  "https://generador-turnos.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  /\.vercel\.app$/,
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((allowed) =>
      allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS bloqueado para origen: ${origin}`);
      callback(new Error(`CORS: Origen no permitido: ${origin}`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Responder a preflight OPTIONS
app.options("*", cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Servir archivos generados para descarga
app.use("/downloads", express.static(path.join(__dirname, "temp")));

// Rutas API
app.use("/api", apiRoutes);

// En producción, intentar servir el frontend compilado
// Soporta múltiples rutas posibles según la estructura del proyecto
if (process.env.NODE_ENV === "production") {
  const posiblesFrontend = [
    path.join(__dirname, "../client/dist"),
    path.join(__dirname, "client/dist"),
    path.join(__dirname, "../dist"),
    path.join(__dirname, "dist"),
    path.join(__dirname, "public"),
  ];

  const frontendDir = posiblesFrontend.find(
    (p) => fs.existsSync(p) && fs.existsSync(path.join(p, "index.html"))
  );

  if (frontendDir) {
    console.log(`📂 Sirviendo frontend desde: ${frontendDir}`);
    app.use(express.static(frontendDir));
    app.get("*", (req, res) => {
      // Solo enviar index.html para rutas que no sean /api
      if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(frontendDir, "index.html"));
      }
    });
  } else {
    console.warn("⚠️  Frontend compilado no encontrado. Solo API disponible.");
    // No registrar catch-all que cause el error ENOENT
    app.get("/", (req, res) => {
      res.json({
        status: "ok",
        message: "API de Generador de Turnos funcionando",
        endpoints: ["/api/analyze", "/api/generate", "/api/agentes", "/api/historial", "/api/health"],
      });
    });
  }
}

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔑 Anthropic API: ${process.env.ANTHROPIC_API_KEY ? "Configurada" : "❌ NO configurada"}`);
  console.log(`🗄️  Supabase URL: ${process.env.SUPABASE_URL ? "Configurada" : "❌ NO configurada"}`);
  console.log(`🗄️  Supabase Key: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "Configurada" : "❌ NO configurada"}`);
});