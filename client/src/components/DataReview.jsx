import { useState, useMemo } from 'react'
import { Check, ChevronLeft, Loader2, Plus, Trash2, Edit3, Save, AlertTriangle, Users, CalendarDays } from 'lucide-react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '';

export default function DataReview({ data, onConfirm, onBack, onError }) {
  const [metadata, setMetadata] = useState(data.metadata || {})
  const [turnos, setTurnos] = useState(data.turnos || [])
  const [isGenerating, setIsGenerating] = useState(false)
  const [editingRow, setEditingRow] = useState(null)

  // Stats
  const stats = useMemo(() => {
    const agentes = new Set(turnos.map(t => t.cedula)).size
    const dias = new Set(turnos.map(t => t.fecha)).size
    const descansos = turnos.filter(t => t.esDescanso).length
    const splits = turnos.filter(t => t.esSplit).length
    const warnings = turnos.filter(t =>
      (t.nombre || '').includes('???') ||
      (t.cedula || '').includes('???') ||
      (t.horaInicio || '').includes('???')
    ).length
    return { agentes, dias, descansos, splits, warnings, total: turnos.length }
  }, [turnos])

  // Agrupar turnos por agente
  const turnosByAgent = useMemo(() => {
    const grouped = {}
    for (const turno of turnos) {
      const key = turno.cedula || turno.nombre
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(turno)
    }
    return grouped
  }, [turnos])

  const updateTurno = (index, field, value) => {
    setTurnos(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const deleteTurno = (index) => {
    setTurnos(prev => prev.filter((_, i) => i !== index))
  }

  const addTurno = () => {
    const newTurno = {
      cedula: '',
      nombre: '',
      fecha: metadata.fechaInicio || '',
      diaSemana: '',
      horaInicio: '07:00',
      horaFin: '17:00',
      esDescanso: false,
      esSplit: false,
      splitHoraInicio2: null,
      splitHoraFin2: null,
      almuerzo: '12:00 - 13:00',
      campana: metadata.campana || '',
      jornada: '07:00 - 17:00 D 1h',
    }
    setTurnos(prev => [...prev, newTurno])
    setEditingRow(turnos.length)
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    onError(null)

    try {
      const response = await axios.post(`${API_URL}/api/generate`, {
        scheduleData: turnos,
        metadata,
        imagenesPaths: data.imagenesPaths || [], // ⬅️ AGREGAR ESTA LÍNEA
      })

      if (response.data.success) {
        onConfirm(response.data.files)
      } else {
        onError(response.data.error || 'Error generando los archivos')
      }
    } catch (err) {
      const message = err.response?.data?.error || err.message
      onError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Metadata Section */}
      <div className="glass-card p-6">
        <h2 className="font-display font-bold text-lg text-surface-100 mb-4 flex items-center gap-2">
          <Edit3 className="w-5 h-5 text-brand-400" />
          Información General
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-mono text-surface-400 mb-1.5">Supervisor / Líder</label>
            <input
              type="text"
              value={metadata.supervisor || ''}
              onChange={(e) => setMetadata(prev => ({ ...prev, supervisor: e.target.value }))}
              className="input-field"
              placeholder="Nombre del supervisor"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-surface-400 mb-1.5">Campaña</label>
            <input
              type="text"
              value={metadata.campana || ''}
              onChange={(e) => setMetadata(prev => ({ ...prev, campana: e.target.value }))}
              className="input-field"
              placeholder="Nombre de la campaña"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-surface-400 mb-1.5">Contrato</label>
            <input
              type="text"
              value={metadata.contrato || ''}
              onChange={(e) => setMetadata(prev => ({ ...prev, contrato: e.target.value }))}
              className="input-field"
              placeholder="Código del contrato"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-surface-400 mb-1.5">Semana</label>
            <input
              type="text"
              value={metadata.semana || ''}
              onChange={(e) => setMetadata(prev => ({ ...prev, semana: e.target.value }))}
              className="input-field"
              placeholder="del X al Y de mes"
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Agentes', value: stats.agentes, icon: <Users className="w-4 h-4" />, color: 'text-brand-400' },
          { label: 'Días', value: stats.dias, icon: <CalendarDays className="w-4 h-4" />, color: 'text-blue-400' },
          { label: 'Turnos', value: stats.total, icon: '📋', color: 'text-surface-200' },
          { label: 'Descansos', value: stats.descansos, icon: '😴', color: 'text-amber-400' },
          { label: 'Split', value: stats.splits, icon: '⏰', color: 'text-purple-400' },
          { label: 'Advertencias', value: stats.warnings, icon: <AlertTriangle className="w-4 h-4" />, color: stats.warnings > 0 ? 'text-red-400' : 'text-emerald-400' },
        ].map((s) => (
          <div key={s.label} className="glass-card-light p-3 text-center">
            <div className={`flex items-center justify-center gap-1.5 mb-1 ${s.color}`}>
              {typeof s.icon === 'string' ? <span>{s.icon}</span> : s.icon}
              <span className="font-display font-bold text-xl">{s.value}</span>
            </div>
            <span className="text-xs text-surface-500 font-mono">{s.label}</span>
          </div>
        ))}
      </div>

      {stats.warnings > 0 && (
        <div className="glass-card border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-300 font-medium">
              Se encontraron {stats.warnings} campos con datos inciertos (marcados con ???)
            </p>
            <p className="text-xs text-surface-400 mt-1">
              Revisa y corrige los campos resaltados en rojo antes de generar los archivos.
            </p>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-surface-800/50">
          <h2 className="font-display font-bold text-lg text-surface-100">
            Turnos Extraídos ({turnos.length})
          </h2>
          <button onClick={addTurno} className="btn-secondary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Agregar turno
          </button>
        </div>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur">
              <tr className="text-xs font-mono text-surface-400 uppercase tracking-wider">
                <th className="table-cell text-left w-10">#</th>
                <th className="table-cell text-left">Cédula</th>
                <th className="table-cell text-left">Nombre</th>
                <th className="table-cell text-left">Fecha</th>
                <th className="table-cell text-left">Día</th>
                <th className="table-cell text-center">Inicio</th>
                <th className="table-cell text-center">Fin</th>
                <th className="table-cell text-center">Almuerzo</th>
                <th className="table-cell text-center">Split</th>
                <th className="table-cell text-center">Descanso</th>
                <th className="table-cell text-center">Campaña</th>
                <th className="table-cell text-center w-20">Acc.</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((turno, idx) => {
                const isEditing = editingRow === idx
                const hasWarning = (turno.nombre || '').includes('???') ||
                  (turno.cedula || '').includes('???') ||
                  (turno.horaInicio || '').includes('???')

                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      hasWarning ? 'bg-red-500/5' : idx % 2 === 0 ? 'bg-transparent' : 'bg-surface-900/20'
                    } hover:bg-surface-800/30`}
                  >
                    <td className="table-cell text-surface-500 font-mono text-xs">{idx + 1}</td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={turno.cedula || ''}
                        onChange={(e) => updateTurno(idx, 'cedula', e.target.value)}
                        className={`input-field text-xs py-1.5 ${hasWarning && (turno.cedula || '').includes('???') ? 'border-red-500/50' : ''}`}
                      />
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={turno.nombre || ''}
                        onChange={(e) => updateTurno(idx, 'nombre', e.target.value)}
                        className={`input-field text-xs py-1.5 min-w-[180px] ${hasWarning && (turno.nombre || '').includes('???') ? 'border-red-500/50' : ''}`}
                      />
                    </td>

                    <td className="table-cell">
                      <input
                        type="date"
                        value={turno.fecha || ''}
                        onChange={(e) => updateTurno(idx, 'fecha', e.target.value)}
                        className="input-field text-xs py-1.5"
                      />
                    </td>

                    <td className="table-cell text-xs text-surface-300 font-mono">
                      {turno.diaSemana || getDayName(turno.fecha)}
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={turno.esDescanso ? '-' : turno.horaInicio || ''}
                        onChange={(e) => updateTurno(idx, 'horaInicio', e.target.value)}
                        disabled={turno.esDescanso}
                        className="input-field text-xs py-1.5 text-center w-20 disabled:opacity-40"
                        placeholder="HH:MM"
                      />
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={turno.esDescanso ? '-' : turno.horaFin || ''}
                        onChange={(e) => updateTurno(idx, 'horaFin', e.target.value)}
                        disabled={turno.esDescanso}
                        className="input-field text-xs py-1.5 text-center w-20 disabled:opacity-40"
                        placeholder="HH:MM"
                      />
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={turno.esDescanso ? '-' : turno.almuerzo || ''}
                        onChange={(e) => updateTurno(idx, 'almuerzo', e.target.value)}
                        disabled={turno.esDescanso}
                        className="input-field text-xs py-1.5 text-center w-32 disabled:opacity-40"
                        placeholder="HH:MM - HH:MM"
                      />
                    </td>

                    <td className="table-cell text-center">
                      <input
                        type="checkbox"
                        checked={turno.esSplit || false}
                        onChange={(e) => updateTurno(idx, 'esSplit', e.target.checked)}
                        disabled={turno.esDescanso}
                        className="w-4 h-4 rounded accent-brand-500"
                      />
                    </td>

                    <td className="table-cell text-center">
                      <input
                        type="checkbox"
                        checked={turno.esDescanso || false}
                        onChange={(e) => updateTurno(idx, 'esDescanso', e.target.checked)}
                        className="w-4 h-4 rounded accent-amber-500"
                      />
                    </td>

                    <td className="table-cell">
                      <input
                        type="text"
                        value={turno.campana || ''}
                        onChange={(e) => updateTurno(idx, 'campana', e.target.value)}
                        className="input-field text-xs py-1.5 text-center w-28"
                      />
                    </td>

                    <td className="table-cell text-center">
                      <button
                        onClick={() => deleteTurno(idx)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-surface-500 hover:text-red-400 transition-colors"
                        title="Eliminar turno"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split turno details (shown inline when esSplit is checked) */}
      {turnos.some(t => t.esSplit && !t.esDescanso) && (
        <div className="glass-card p-4">
          <h3 className="font-display font-semibold text-sm text-purple-300 mb-3 flex items-center gap-2">
            ⏰ Detalle de Turnos Split
          </h3>
          <div className="space-y-2">
            {turnos.map((turno, idx) => {
              if (!turno.esSplit || turno.esDescanso) return null
              return (
                <div key={idx} className="flex items-center gap-3 text-sm glass-card-light p-3">
                  <span className="font-mono text-surface-400 w-8">#{idx + 1}</span>
                  <span className="text-surface-300 w-40 truncate">{turno.nombre}</span>
                  <span className="text-surface-400 text-xs">2do bloque:</span>
                  <input
                    type="text"
                    value={turno.splitHoraInicio2 || ''}
                    onChange={(e) => updateTurno(idx, 'splitHoraInicio2', e.target.value)}
                    className="input-field text-xs py-1.5 w-20 text-center"
                    placeholder="HH:MM"
                  />
                  <span className="text-surface-500">—</span>
                  <input
                    type="text"
                    value={turno.splitHoraFin2 || ''}
                    onChange={(e) => updateTurno(idx, 'splitHoraFin2', e.target.value)}
                    className="input-field text-xs py-1.5 w-20 text-center"
                    placeholder="HH:MM"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" />
          Volver
        </button>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || turnos.length === 0}
          className="btn-success flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 spinner" />
              Generando archivos...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Confirmar y Generar Excel ({turnos.length} turnos)
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function getDayName(dateStr) {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr + 'T12:00:00')
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    return days[date.getDay()] || ''
  } catch {
    return ''
  }
}
