/**
 * Focus-aware z-index for a floating modal. The modal stays open when the user
 * clicks a terminal window (or anything else): it just drops below the
 * terminal instead of closing, and clicking the modal card raises it back.
 * A newly opened modal (or one whose content changed) starts on top.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'

/** Z-index of a focused modal: above the terminal shell.overlay layer (1100). */
const ACTIVE_Z = 1200
/** Z-index of an unfocused modal: below the terminal layer. */
const INACTIVE_Z = 800

/**
 * Track whether this modal was last clicked and return the card ref plus its
 * dynamic z-index. The ref is placed on the card so `contains` distinguishes a
 * click on the modal from a click that fell through its click-through backdrop
 * onto a terminal window or the workspace.
 * @param resetKey - identity of the modal's current content; when it changes
 * (a new diff/file opens, a closed modal reopens) the modal raises to the top.
 * @returns the card ref and the current z-index.
 */
export function useModalFocus(resetKey: unknown): { ref: RefObject<HTMLDivElement>; zIndex: number } {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(true)

  // A fresh or changed modal starts on top.
  useEffect(() => { setActive(true) }, [resetKey])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      setActive(ref.current?.contains(target) ?? false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => { window.removeEventListener('pointerdown', onPointerDown, true) }
  }, [])

  return { ref, zIndex: active ? ACTIVE_Z : INACTIVE_Z }
}
