// Barrel re-export for all real-time collaboration hooks and providers — import from here for convenience.
export { RealtimeProvider, useRealtime, useActiveAdmins, usePresence, useTableSubscription } from './realtime-provider'
export { useStructureSync, useCourseSync } from './use-sync-structure'
export { useDraftContentSync, useAutoSaveDraft } from './use-sync-content'
