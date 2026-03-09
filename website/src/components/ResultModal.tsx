import React, { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { CheckCircle, XCircle } from "lucide-react"
import LoadingSpinner from "./LoadingSpinner"
import { useTheme } from "../context/ThemeContext"

type RevealPhase = 'hidden' | 'exploding' | 'revealed'

interface ResultModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  success: boolean
  loading?: boolean
  children?: React.ReactNode
  reveal?: boolean
  revealColor?: string
}

export default function ResultModal({
  isOpen,
  onClose,
  title,
  description,
  success,
  loading = false,
  children,
  reveal = false,
  revealColor = "#a3e635",
}: ResultModalProps): React.JSX.Element {
  const { theme } = useTheme()
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('hidden')
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; tx: number; ty: number; delay: number; size: number; color: string }>>([])

  // Reset reveal phase when modal opens with loading, or when closed
  useEffect(() => {
    if (loading) {
      setRevealPhase('hidden')
      setParticles([])
    }
  }, [loading])

  useEffect(() => {
    if (!isOpen) {
      setRevealPhase('hidden')
      setParticles([])
    }
  }, [isOpen])

  const handleReveal = useCallback(() => {
    if (revealPhase !== 'hidden') return
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#A3E635', '#FF9F1C', '#E040FB', '#00E5FF', '#FFEB3B']
    const newParticles = Array.from({ length: 24 }, (_, i) => {
      const angle = ((i * 15) + Math.random() * 10) * (Math.PI / 180)
      const distance = 80 + Math.random() * 60
      return {
        id: i,
        x: 50 + (Math.random() - 0.5) * 20,
        y: 50 + (Math.random() - 0.5) * 20,
        tx: Math.cos(angle) * distance,
        ty: Math.sin(angle) * distance,
        delay: Math.random() * 0.15,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
      }
    })
    setParticles(newParticles)
    setRevealPhase('exploding')
    setTimeout(() => setRevealPhase('revealed'), 600)
  }, [revealPhase])

  const isRevealing = reveal && success && !loading
  const showRevealCard = isRevealing && revealPhase === 'hidden'
  const showRevealAnim = isRevealing && revealPhase === 'exploding'
  const showRevealed = !reveal || !success || loading || revealPhase === 'revealed'

  const bgClass = theme === 'dark' ? 'bg-black/95' : 'bg-[#f5c89a]'
  const borderClass = theme === 'dark' ? 'border-lime-400' : 'border-orange-700'
  const successColor = theme === 'dark' ? 'text-lime-400' : 'text-orange-700'
  const descColor = theme === 'dark' ? 'text-white/70' : 'text-orange-900/70'

  const canClose = !loading && (!isRevealing || revealPhase === 'revealed')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && canClose && onClose()}>
      <DialogContent className={`${bgClass} border-2 ${borderClass} rounded-2xl max-w-md`}>
        <DialogHeader className="text-center">
          {/* Header icon - hide during reveal card/explosion phases */}
          {(!isRevealing || revealPhase === 'revealed') && (
            <div className="flex justify-center mb-4">
              {loading ? (
                <div className="w-16 h-16 flex items-center justify-center">
                  <LoadingSpinner size="lg" />
                </div>
              ) : success ? (
                <CheckCircle className={`w-16 h-16 ${successColor}`} />
              ) : (
                <XCircle className="w-16 h-16 text-red-400" />
              )}
            </div>
          )}
          <DialogTitle
            className={`font-bangers text-3xl text-center ${
              loading ? successColor : success ? successColor : "text-red-400"
            } ${isRevealing && revealPhase === 'revealed' ? 'animate-reveal-title' : ''}
            ${showRevealAnim ? 'sr-only' : ''}`}
          >
            {title}
          </DialogTitle>
          {description && !showRevealCard && !showRevealAnim && (
            <DialogDescription className={`font-righteous ${descColor} text-base mt-2 text-center`}>
              {description}
            </DialogDescription>
          )}
          {(showRevealCard || showRevealAnim) && (
            <DialogDescription className="sr-only">Tap to reveal result</DialogDescription>
          )}
        </DialogHeader>

        {/* Reveal mechanic */}
        {isRevealing && revealPhase !== 'revealed' && (
          <div className="py-4 flex justify-center">
            <div className="relative" style={{ width: '256px', height: '267px' }}>
              {/* Explosion particles */}
              {showRevealAnim && particles.map(p => (
                <div
                  key={p.id}
                  className="absolute rounded-full animate-particle-burst"
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                    animationDelay: `${p.delay}s`,
                    '--particle-tx': `${p.tx}px`,
                    '--particle-ty': `${p.ty}px`,
                  } as React.CSSProperties}
                />
              ))}

              {/* Card back */}
              {showRevealCard && (
                <button onClick={handleReveal} className="w-full h-full cursor-pointer group">
                  <div className="w-full h-full rounded-2xl overflow-hidden
                    border-2 transition-all duration-300 group-hover:scale-[1.02]
                    flex flex-col items-center justify-center gap-3 relative"
                    style={{
                      background: `linear-gradient(to bottom right, ${revealColor}22, ${revealColor}88, ${revealColor}22)`,
                      borderColor: `${revealColor}80`,
                      boxShadow: `0 0 20px ${revealColor}50`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = revealColor
                      e.currentTarget.style.boxShadow = `0 0 40px ${revealColor}99`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = `${revealColor}80`
                      e.currentTarget.style.boxShadow = `0 0 20px ${revealColor}50`
                    }}
                  >
                    <div className="absolute inset-0 opacity-10"
                      style={{ backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, ${revealColor}4D 10px, ${revealColor}4D 11px)` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer overflow-hidden rounded-2xl" />
                    <span className="text-6xl select-none relative">?</span>
                    <span className="font-bangers text-xl relative animate-pulse" style={{ color: revealColor }}>
                      TAP TO REVEAL
                    </span>
                  </div>
                </button>
              )}

              {/* Flash */}
              {showRevealAnim && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full animate-reveal-flash" style={{ backgroundColor: revealColor, '--flash-color': revealColor } as React.CSSProperties} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content - wrap in reveal animation if applicable */}
        {children && showRevealed && (
          <div className={`py-4 ${isRevealing && revealPhase === 'revealed' ? 'animate-reveal-freg' : ''}`}>
            {children}
          </div>
        )}

        {canClose && !loading && (
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={onClose}
              className={`font-bangers text-xl px-8 py-3 rounded-xl ${
                success
                  ? "btn-theme-primary"
                  : "bg-red-500 hover:bg-red-400 text-white"
              }`}
            >
              {success ? "Ribbit!" : "Close"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
