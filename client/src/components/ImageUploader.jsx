import { useState, useRef } from 'react'
import { Upload, Image, Loader2, X, Plus } from 'lucide-react'
import axios from 'axios'

// ⚠️ IMPORTANTE: Esta línea obtiene la URL del backend de las variables de entorno
const API_URL = import.meta.env.VITE_API_URL || '';

export default function ImageUploader({ onAnalysisComplete, onError }) {
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleFileSelect = (selectedFiles) => {
    if (!selectedFiles || selectedFiles.length === 0) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    const newFiles = []
    const newPreviews = []

    const fileArray = Array.from(selectedFiles)

    for (const file of fileArray) {
      if (!allowedTypes.includes(file.type)) {
        onError(`Archivo "${file.name}" no permitido. Solo se permiten PNG, JPG o WebP`)
        continue
      }
      newFiles.push(file)
    }

    if (newFiles.length === 0) return

    // Read previews for new files
    let loaded = 0
    for (const file of newFiles) {
      const reader = new FileReader()
      reader.onload = (e) => {
        newPreviews.push({ name: file.name, url: e.target.result, size: file.size })
        loaded++
        if (loaded === newFiles.length) {
          setFiles(prev => [...prev, ...newFiles])
          setPreviews(prev => [...prev, ...newPreviews])
        }
      }
      reader.readAsDataURL(file)
    }
    onError(null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleAnalyze = async () => {
    if (files.length === 0) return

    setIsAnalyzing(true)
    onError(null)

    try {
      const formData = new FormData()
      for (const file of files) {
        formData.append('images', file)
      }

      // ✅ LÍNEA CRÍTICA: Usar la URL completa del backend
      const response = await axios.post(`${API_URL}/api/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000, // 10 min timeout para Opus 4.6 con pensamiento extendido
      })

      if (response.data.success) {
        onAnalysisComplete(response.data.data)
      } else {
        onError(response.data.error || 'Error desconocido en el análisis')
      }
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Error al conectar con el servidor'
      onError(message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const clearAll = () => {
    setFiles([])
    setPreviews([])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Drop Zone */}
      <div
        className={`glass-card p-8 transition-all duration-300 cursor-pointer ${
          dragOver
            ? 'border-brand-400 bg-brand-600/10 scale-[1.01]'
            : 'hover:border-surface-600'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => files.length === 0 && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-brand-600/10 border border-brand-500/20 flex items-center justify-center mb-6">
              <Upload className="w-9 h-9 text-brand-400" />
            </div>
            <h3 className="font-display font-semibold text-xl text-surface-200 mb-2">
              Sube las imágenes de la Maya Horaria
            </h3>
            <p className="text-surface-400 text-sm max-w-md mb-4">
              Arrastra y suelta las imágenes aquí, o haz clic para seleccionar.
              <br />
              <span className="text-brand-400 font-medium">Puedes subir múltiples imágenes</span> (una por campaña).
              <br />
              Formatos: PNG, JPG, WebP (máx 20MB c/u)
            </p>
            <div className="flex items-center gap-2 text-surface-500 text-xs font-mono">
              <Image className="w-4 h-4" />
              <span>Las imágenes serán analizadas por Claude AI para extraer los turnos</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6" onClick={(e) => e.stopPropagation()}>
            {/* Previews grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {previews.map((preview, idx) => (
                <div key={idx} className="relative group">
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(idx) }}
                    className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-surface-950/80 hover:bg-red-600/80 text-surface-300 hover:text-white transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="rounded-xl overflow-hidden border border-surface-700/30 bg-surface-900/50">
                    <img
                      src={preview.url}
                      alt={`Maya horaria - ${preview.name}`}
                      className="w-full max-h-[350px] object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-2 px-1">
                    <Image className="w-4 h-4 text-brand-400" />
                    <span className="text-xs text-surface-300 truncate">{preview.name}</span>
                    <span className="text-xs text-surface-500 font-mono">
                      {(preview.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              ))}

              {/* Add more images button */}
              <button
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-surface-700/50 hover:border-brand-500/50 hover:bg-brand-600/5 transition-all min-h-[200px]"
              >
                <Plus className="w-8 h-8 text-surface-500" />
                <span className="text-sm text-surface-400">Agregar otra imagen</span>
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-surface-300 font-medium">
                  {files.length} imagen{files.length > 1 ? 'es' : ''} seleccionada{files.length > 1 ? 's' : ''}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); clearAll() }}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Limpiar todo
                </button>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); handleAnalyze() }}
                disabled={isAnalyzing}
                className="btn-primary flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 spinner" />
                    <span>Analizando {files.length} imagen{files.length > 1 ? 'es' : ''} con Claude...</span>
                  </>
                ) : (
                  <>
                    <span>🤖</span>
                    <span>Analizar {files.length > 1 ? `${files.length} imágenes` : 'imagen'}</span>
                  </>
                )}
              </button>
            </div>

            {isAnalyzing && (
              <div className="glass-card-light p-4 animate-pulse-soft">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                  <p className="text-sm text-surface-300">
                    Claude Opus 4.6 está analizando {files.length > 1 ? 'las mayas horarias' : 'la maya horaria'} con pensamiento extendido... Esto puede tomar de 2 a 5 minutos para un análisis exhaustivo.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: '📷',
            title: 'Múltiples imágenes',
            desc: 'Sube una imagen por cada campaña (ej: Corficolombiana, AVC)',
          },
          {
            icon: '🔍',
            title: 'Claude analiza',
            desc: 'La IA extrae agentes, horarios, descansos, splits y almuerzos',
          },
          {
            icon: '📊',
            title: 'Genera Excel',
            desc: 'Se crean los dos archivos: Formato Turnos y Plantilla Prometeo',
          },
        ].map((item) => (
          <div key={item.title} className="glass-card-light p-4 flex items-start gap-3">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <h4 className="font-display font-semibold text-surface-200 text-sm">{item.title}</h4>
              <p className="text-xs text-surface-400 mt-1">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}