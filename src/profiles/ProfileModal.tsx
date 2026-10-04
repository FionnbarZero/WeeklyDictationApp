import { useState, type FormEvent } from 'react'
import { Check, X } from 'lucide-react'
import { useDialogFocus } from '../accessibility/useDialogFocus.ts'
import { DEFAULT_GRADE, DEFAULT_SCHOOL_YEAR } from '../config.ts'
import { authErrorMessage } from '../firebaseClient.ts'
import type { ChildProfile } from '../persistence/cloudRecords.ts'

export type ProfileModalChild = ChildProfile & { name: string; color: string; initials: string }

export type ProfileModalProps = {
  children: ProfileModalChild[]
  selectedChildId: string
  onSelect: (id: string) => void
  onClose: () => void
  onAdd: (input: Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear'>) => Promise<void>
  onUpdate: (
    childId: string,
    patch: Partial<Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear' | 'active'>>,
  ) => Promise<void>
  onError: (message: string) => void
}

export function ProfileModal({
  children,
  selectedChildId,
  onSelect,
  onClose,
  onAdd,
  onUpdate,
  onError,
}: ProfileModalProps) {
  const [nickname, setNickname] = useState('')
  const [grade, setGrade] = useState<string>(DEFAULT_GRADE)
  const [schoolYear, setSchoolYear] = useState(DEFAULT_SCHOOL_YEAR)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose)
  const add = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onAdd({ nickname, grade, schoolYear })
      setNickname('')
    } catch (caught) {
      const message = `Profile could not be added. ${authErrorMessage(caught)}`
      setError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }
  const update = async (
    childId: string,
    patch: Partial<Pick<ChildProfile, 'nickname' | 'grade' | 'schoolYear' | 'active'>>,
  ) => {
    setSaving(true)
    setError(null)
    try {
      await onUpdate(childId, patch)
    } catch (caught) {
      const message = `Profile changes could not be saved. ${authErrorMessage(caught)}`
      setError(message)
      onError(message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        tabIndex={-1}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Family profiles</p>
            <h2 id="profile-modal-title">Who is practicing?</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close profile manager" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="profile-grid">
          {children.map((child) => (
            <div
              key={child.id}
              className={`profile-card ${child.id === selectedChildId ? 'active' : ''} ${!child.active ? 'inactive' : ''}`}
            >
              <button
                className="profile-select"
                type="button"
                disabled={!child.active}
                onClick={() => {
                  onSelect(child.id)
                  onClose()
                }}
              >
                <span className={`avatar avatar-${child.color} avatar-large`}>{child.initials}</span>
                <strong>{child.name}</strong>
                <span>
                  {child.grade} · {child.active ? 'Active' : 'Inactive'}
                </span>
                {child.id === selectedChildId && (
                  <span className="profile-check">
                    <Check size={14} />
                  </span>
                )}
              </button>
              <div className="profile-actions">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    const nextName = window.prompt('Child nickname', child.nickname)
                    if (nextName && nextName !== child.nickname) void update(child.id, { nickname: nextName })
                  }}
                >
                  Edit nickname
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void update(child.id, { active: !child.active })}
                >
                  {child.active ? 'Mark inactive' : 'Reactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <form className="add-child-form" onSubmit={add}>
          <h3>Add child</h3>
          <input
            placeholder="Nickname"
            aria-label="Nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            required
          />
          <select aria-label="Grade" value={grade} onChange={(event) => setGrade(event.target.value)}>
            <option>Kindergarten</option>
            <option>Grade 1</option>
            <option>Grade 2</option>
            <option>Grade 3</option>
            <option>Grade 4</option>
            <option>Grade 5</option>
          </select>
          <input value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} aria-label="School year" />
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Add child'}
          </button>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

export default ProfileModal
