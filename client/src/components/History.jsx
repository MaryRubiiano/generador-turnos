import { useState, useEffect } from 'react'
import { Download, FileSpreadsheet, Trash2, Calendar, Users, Clock, History as HistoryIcon, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '';

export default function History({ onClose, onLoadAnalysis }) {
  const [historial, setHistorial] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    cargarHistorial()
  }, [])

  const cargarHistorial = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await axios.get(`${API_URL}/api/historial`)
      
      if (response.data.success) {
        setHistorial(response.data.data)
      } else {
        setError('Error cargando historial')
      }
    } catch (err) {
      const message = err.response?.data?.error || err.message
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const eliminarAnalisis = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este análisis? Esto también eliminará las imágenes y archivos Excel.')) {
      return
    }

    setDeletingId(id)
    
    try {
      await axios.delete(`${API_URL}/api/historial/${id}`)
      setHistorial(prev => prev.filter(item => item.id !== id))
    } catch (err) {
      const message = err.response?.data?.error || err.message
      alert(`Error eliminando análisis: ${message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const formatearFecha = (fecha) => {
    const date = new Date(fecha)
    const ahora = new Date()
    const diff = ahora - date
    const minutos = Math.floor(diff / 60000)
    const horas = Math.floor(minutos / 60)
    const dias = Math.floor(horas / 24)

    if (minutos < 60) return `Hace ${minutos} min`
    if (horas < 24) return `Hace ${horas}h`
    if (dias < 7) return `Hace ${dias}d`
    
    return date.toLocaleDateString('es-CO', { 
      day: '2-digit', 
      month: 'short',
      year: 'numeric'
    })
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
            <HistoryIcon className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="font-display font-bold text-xl text-surface-100">
              Historial de Análisis
            </h2>
            <p className="text-sm text-surface-400">
              {historial.length} {historial.length === 1 ? 'análisis' : 'análisis'} guardado{historial.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        
        {onClose && (
          <button onClick={onClose} className="btn-secondary text-sm">
            Cerrar
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="glass-card p-12 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-brand-400 spinner" />
          <p className="text-surface-400">Cargando historial...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="glass-card border-red-500/30 bg-red-500/10 p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-medium">Error cargando historial</p>
            <p className="text-xs text-surface-400 mt-1">{error}</p>
            <button onClick={cargarHistorial} className="text-xs text-red-400 hover:text-red-300 underline mt-2">
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && historial.length === 0 && (
        <div className="glass-card p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-surface-800/50 flex items-center justify-center mx-auto mb-4">
            <HistoryIcon className="w-10 h-10 text-surface-500" />
          </div>
          <h3 className="font-display font-semibold text-lg text-surface-200 mb-2">
            No hay análisis guardados
          </h3>
          <p className="text-sm text-surface-400">
            Los análisis que generes aparecerán aquí
          </p>
        </div>
      )}

      {/* Lista de análisis */}
      {!isLoading && !error && historial.length > 0 && (
        <div className="space-y-4">
          {historial.map((item) => (
            <div key={item.id} className="glass-card p-6 hover:border-surface-600/50 transition-all">
              {/* Cabecera del análisis */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-display font-semibold text-surface-100">
                      {item.campana || 'Análisis de Turnos'}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-xs bg-brand-600/20 text-brand-300 border border-brand-500/30">
                      {item.semana || 'Sin semana'}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs text-surface-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatearFecha(item.created_at)}</span>
                    </div>
                    {item.supervisor && (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{item.supervisor}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => eliminarAnalisis(item.id)}
                  disabled={deletingId === item.id}
                  className="p-2 rounded-lg hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  title="Eliminar análisis"
                >
                  {deletingId === item.id ? (
                    <Loader2 className="w-4 h-4 spinner" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Estadísticas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="glass-card-light p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-brand-400">
                    <Users className="w-3.5 h-3.5" />
                    <span className="font-display font-bold text-lg">{item.total_agentes || 0}</span>
                  </div>
                  <span className="text-xs text-surface-500">Agentes</span>
                </div>

                <div className="glass-card-light p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-blue-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-display font-bold text-lg">{item.total_turnos || 0}</span>
                  </div>
                  <span className="text-xs text-surface-500">Turnos</span>
                </div>

                <div className="glass-card-light p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-amber-400">
                    <span className="text-base">😴</span>
                    <span className="font-display font-bold text-lg">{item.total_descansos || 0}</span>
                  </div>
                  <span className="text-xs text-surface-500">Descansos</span>
                </div>

                <div className="glass-card-light p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1 text-purple-400">
                    <span className="text-base">⏰</span>
                    <span className="font-display font-bold text-lg">{item.total_splits || 0}</span>
                  </div>
                  <span className="text-xs text-surface-500">Split</span>
                </div>
              </div>

              {/* Imágenes subidas */}
              {item.imagenes_urls && item.imagenes_urls.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-mono text-surface-400 mb-2 flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {item.imagenes_urls.length} imagen{item.imagenes_urls.length > 1 ? 'es' : ''} analizada{item.imagenes_urls.length > 1 ? 's' : ''}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {item.imagenes_urls.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-video rounded-lg overflow-hidden border border-surface-700/30 hover:border-brand-500/50 transition-all"
                      >
                        <img
                          src={url}
                          alt={`Maya horaria ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                          <span className="text-xs text-surface-200">Ver imagen</span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Archivos Excel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {item.formato_turnos_url && (
                  <a
                    href={item.formato_turnos_url}
                    download
                    className="flex items-center gap-3 p-3 rounded-lg bg-brand-600/10 border border-brand-500/20 hover:bg-brand-600/20 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-brand-600/20 flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5 text-brand-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-200 truncate">
                        Formato Turnos
                      </p>
                      <p className="text-xs text-surface-400">Excel</p>
                    </div>
                    <Download className="w-4 h-4 text-brand-400 group-hover:translate-y-0.5 transition-transform" />
                  </a>
                )}

                {item.plantilla_prometeo_url && (
                  <a
                    href={item.plantilla_prometeo_url}
                    download
                    className="flex items-center gap-3 p-3 rounded-lg bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-200 truncate">
                        Plantilla Prometeo
                      </p>
                      <p className="text-xs text-surface-400">Excel</p>
                    </div>
                    <Download className="w-4 h-4 text-emerald-400 group-hover:translate-y-0.5 transition-transform" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}