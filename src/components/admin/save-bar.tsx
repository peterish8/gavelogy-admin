'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSaveBar } from '@/contexts/draft-context'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function SaveBar() {
  const {
    hasUnsavedChanges,
    isSaving,
    lastSaveError,
    changesCount,
    commitChanges,
    discardChanges
  } = useSaveBar()

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)

  const handleSave = async () => {
    setShowSaveDialog(false)
    const result = await commitChanges()
    if (result.success) {
      // Show success toast - you can use sonner here
      console.log('Changes saved successfully!')
    }
  }

  const handleDiscard = () => {
    setShowDiscardDialog(false)
    discardChanges()
  }

  return (
    <>
      <AnimatePresence>
        {hasUnsavedChanges && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-500/10">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    You have unsaved changes
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {changesCount} {changesCount === 1 ? 'change' : 'changes'} pending
                  </p>
                </div>
              </div>

              {lastSaveError && (
                <div className="text-sm text-destructive flex items-center gap-2">
                  <X className="w-4 h-4" />
                  {lastSaveError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDiscardDialog(true)}
                  disabled={isSaving}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowSaveDialog(true)}
                  disabled={isSaving}
                  className="min-w-[100px]"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Confirmation Dialog */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the live content visible to all students.
              Are you sure you want to publish these changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>
              Confirm Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              All unsaved changes will be lost. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
