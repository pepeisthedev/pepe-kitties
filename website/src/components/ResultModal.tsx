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

interface ResultModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  success: boolean
  children?: React.ReactNode
}

export default function ResultModal({
  isOpen,
  onClose,
  title,
  description,
  success,
  children,
}: ResultModalProps): React.JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-black/95 border-2 border-lime-400 rounded-2xl max-w-md">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            {success ? (
              <CheckCircle className="w-16 h-16 text-lime-400" />
            ) : (
              <XCircle className="w-16 h-16 text-red-400" />
            )}
          </div>
          <DialogTitle
            className={`font-bangers text-3xl ${
              success ? "text-lime-400" : "text-red-400"
            }`}
          >
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="font-righteous text-white/70 text-base mt-2">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {children && <div className="py-4">{children}</div>}

        <DialogFooter className="justify-center">
          <Button
            onClick={onClose}
            className={`font-bangers text-xl px-8 py-3 rounded-xl ${
              success
                ? "bg-lime-500 hover:bg-lime-400 text-black"
                : "bg-red-500 hover:bg-red-400 text-white"
            }`}
          >
            {success ? "Awesome!" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
