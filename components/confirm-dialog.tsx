'use client'

import { AlertDialog } from '@base-ui/react/alert-dialog'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export function ConfirmDialog({ open, title, description, confirmLabel, destructive, onCancel, onConfirm }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onCancel() }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop" />
        <AlertDialog.Popup className="dialog-popup">
          <div className="dialog-icon"><AlertDialog.Title className="dialog-title">{title}</AlertDialog.Title></div>
          <AlertDialog.Description className="dialog-description">{description}</AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Close render={<Button disabled={busy} type="button" variant="outline" />} onClick={onCancel}>Cancelar</AlertDialog.Close>
            <Button className={destructive ? 'button-danger' : ''} disabled={busy} onClick={() => void confirm()} type="button">
              {busy ? 'Procesando…' : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
