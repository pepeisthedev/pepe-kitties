import React from "react"
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

interface ResultModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  success: boolean
  loading?: boolean
  children?: React.ReactNode
}

export default function ResultModal({
  isOpen,
  onClose,
  title,
  description,
  success,
  loading = false,
  children,
}: ResultModalProps): React.JSX.Element {
  const { theme } = useTheme()

  const bgClass = theme === 'dark' ? 'bg-black/95' : 'bg-[#f5c89a]'
  const borderClass = theme === 'dark' ? 'border-lime-400' : 'border-orange-700'
  const successColor = theme === 'dark' ? 'text-lime-400' : 'text-orange-700'
  const descColor = theme === 'dark' ? 'text-white/70' : 'text-orange-900/70'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className={`${bgClass} border-2 ${borderClass} rounded-2xl max-w-md`}>
        <DialogHeader className="text-center">
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
          <DialogTitle
            className={`font-bangers text-3xl text-center ${
              loading ? successColor : success ? successColor : "text-red-400"
            }`}
          >
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className={`font-righteous ${descColor} text-base mt-2 text-center`}>
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {children && <div className="py-4">{children}</div>}

        {!loading && (
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={onClose}
              className={`font-bangers text-xl px-8 py-3 rounded-xl ${
                success
                  ? "btn-theme-primary"
                  : "bg-red-500 hover:bg-red-400 text-white"
              }`}
            >
              {success ? "Awesome!" : "Close"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
