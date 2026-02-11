import { Download, FileSpreadsheet, RefreshCw, CheckCircle2 } from 'lucide-react'

export default function DownloadPanel({ links, onReset }) {
  const files = [
    {
      name: 'Formato_Turnos_Programados.xlsx',
      description: 'Contiene: Fecha, Cédula, Nombre Agente, Campaña, Supervisor, Hora Inicio, Hora Fin, Almuerzo',
      url: links.formato,
      color: 'brand',
    },
    {
      name: 'Plantilla_Programacion_Turnos_Prometeo.xlsx',
      description: 'Contiene: Cédula, Nombre, Contrato, Jornada, Fecha, Líder + hojas de Contratos y Jornadas',
      url: links.plantilla,
      color: 'emerald',
    },
  ]

  return (
    <div className="animate-slide-up space-y-8">
      {/* Success message */}
      <div className="text-center py-8">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="font-display font-bold text-2xl text-surface-100 mb-2">
          ¡Archivos generados exitosamente!
        </h2>
        <p className="text-surface-400 text-sm max-w-md mx-auto">
          Los dos archivos Excel están listos para descargar. Verifica que los datos sean correctos antes de usarlos.
        </p>
      </div>

      {/* Download cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {files.map((file) => (
          <div key={file.name} className="glass-card p-6 flex flex-col items-center text-center space-y-4 hover:border-surface-600/50 transition-all">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              file.color === 'brand'
                ? 'bg-brand-600/15 border border-brand-500/20'
                : 'bg-emerald-600/15 border border-emerald-500/20'
            }`}>
              <FileSpreadsheet className={`w-8 h-8 ${
                file.color === 'brand' ? 'text-brand-400' : 'text-emerald-400'
              }`} />
            </div>

            <div>
              <h3 className="font-display font-semibold text-surface-200 text-sm mb-1">
                {file.name}
              </h3>
              <p className="text-xs text-surface-500 leading-relaxed">
                {file.description}
              </p>
            </div>

            <a
              href={file.url}
              download
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-display font-semibold text-sm transition-all ${
                file.color === 'brand'
                  ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
              }`}
            >
              <Download className="w-4 h-4" />
              Descargar
            </a>
          </div>
        ))}
      </div>

      {/* New analysis button */}
      <div className="text-center pt-4">
        <button onClick={onReset} className="btn-secondary inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Analizar otra imagen
        </button>
      </div>
    </div>
  )
}
