import { RotateCcw, Calendar } from 'lucide-react'

export default function Header({ currentStep, onReset }) {
  return (
    <header className="border-b border-surface-800/50 backdrop-blur-md bg-surface-950/70 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/30">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-surface-100 tracking-tight">
                Generador de Turnos
              </h1>
              <p className="text-xs text-surface-500 font-mono">Maya Horaria → Excel</p>
            </div>
          </div>

          {currentStep !== 'upload' && (
            <button
              onClick={onReset}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Nuevo análisis</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
