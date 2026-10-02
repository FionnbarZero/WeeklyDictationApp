import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogFocus<TElement extends HTMLElement>(
  open: boolean,
  onDismiss: () => void,
): RefObject<TElement | null> {
  const dialogRef = useRef<TElement>(null)
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const focusableElements = () => (dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)) : [])
    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = focusableElements()[0]
      ;(firstFocusable || dialog)?.focus()
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismissRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const elements = focusableElements()
      if (elements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open])

  return dialogRef
}
