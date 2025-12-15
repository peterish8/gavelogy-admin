'use client'

interface SubjectFilterProps {
  subjects: { id: string; name: string }[] | null
  defaultValue: string
  hiddenQuery?: string
}

export function SubjectFilter({ subjects, defaultValue, hiddenQuery }: SubjectFilterProps) {
  return (
    <form>
      {hiddenQuery && <input type="hidden" name="q" value={hiddenQuery} />}
      <select 
        name="subject"
        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
        defaultValue={defaultValue}
        onChange={(e) => e.target.form?.requestSubmit()}
      >
        <option value="all">All Subjects</option>
        {subjects?.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </form>
  )
}
