import { useState } from 'react'
import Header from './components/Header'
import ImageUploader from './components/ImageUploader'
import DataReview from './components/DataReview'
import DownloadPanel from './components/DownloadPanel'
import History from './components/History'
import { History as HistoryIcon } from 'lucide-react'

const STEPS = {
  UPLOAD: 'upload',
  REVIEW: 'review',
  DOWNLOAD: 'download',
  HISTORY: 'history',
}

function App() {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [analysisData, setAnalysisData] = useState(null)
  const [downloadLinks, setDownloadLinks] = useState(null)
  const [error, setError] = useState(null)

  const handleAnalysisComplete = (data) => {
    setAnalysisData(data)
    setError(null)
    setStep(STEPS.REVIEW)
  }

  const handleGenerationComplete = (links) => {
    setDownloadLinks(links)
    setStep(STEPS.DOWNLOAD)
  }

  const handleReset = () => {
    setStep(STEPS.UPLOAD)
    setAnalysisData(null)
    setDownloadLinks(null)
    setError(null)
  }

  const handleShowHistory = () => {
    setStep(STEPS.HISTORY)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header currentStep={step} onReset={handleReset} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress indicator - solo mostrar si NO estamos en historial */}
        {step !== STEPS.HISTORY && (
          <div className="flex items-center justify-center gap-3 mb-10">
            {[
              { key: STEPS.UPLOAD, label: '1. Subir Imagen', icon: '📸' },
              { key: STEPS.REVIEW, label: '2. Revisar Datos', icon: '📝' },
              { key: STEPS.DOWNLOAD, label: '3. Descargar', icon: '📥' },
            ].map((s, idx) => (
              <div key={s.key} className="flex items-center gap-3">
                {idx > 0 && (
                  <div className={`w-12 h-[2px] ${
                    step === s.key || step === STEPS.DOWNLOAD && idx <= 2 || step === STEPS.REVIEW && idx <= 1
                      ? 'bg-brand-500' : 'bg-surface-700'
                  }`} />
                )}
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  step === s.key
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/40 scale-105'
                    : (step === STEPS.REVIEW && idx === 0) || (step === STEPS.DOWNLOAD && idx < 2)
                      ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-surface-900/40 text-surface-500 border border-surface-800/50'
                }`}>
                  <span>{s.icon}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Botón de historial - mostrar solo en UPLOAD o HISTORY */}
        {(step === STEPS.UPLOAD || step === STEPS.HISTORY) && (
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setStep(step === STEPS.HISTORY ? STEPS.UPLOAD : STEPS.HISTORY)}
              className="btn-secondary flex items-center gap-2"
            >
              <HistoryIcon className="w-4 h-4" />
              {step === STEPS.HISTORY ? 'Volver a inicio' : 'Ver historial'}
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 glass-card border-red-500/30 bg-red-500/10 text-red-300 rounded-xl animate-fade-in">
            <p className="font-medium">❌ Error: {error}</p>
          </div>
        )}

        {step === STEPS.UPLOAD && (
          <ImageUploader
            onAnalysisComplete={handleAnalysisComplete}
            onError={setError}
          />
        )}

        {step === STEPS.REVIEW && analysisData && (
          <DataReview
            data={analysisData}
            onConfirm={handleGenerationComplete}
            onBack={() => setStep(STEPS.UPLOAD)}
            onError={setError}
          />
        )}

        {step === STEPS.DOWNLOAD && downloadLinks && (
          <DownloadPanel
            links={downloadLinks}
            onReset={handleReset}
          />
        )}

        {step === STEPS.HISTORY && (
          <History
            onClose={() => setStep(STEPS.UPLOAD)}
          />
        )}
      </main>

      <footer className="text-center py-6 text-surface-600 text-sm font-mono">
        Generador de Turnos &mdash; Powered by Claude API
      </footer>
    </div>
  )
}

export default App