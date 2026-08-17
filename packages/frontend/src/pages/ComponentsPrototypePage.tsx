import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/PageContainer'
import { PageTitle } from '@/components/PageTitle'
import { cn } from '@/lib/utils'
import { useChromeVariant } from '@/components/PrototypeSwitcher'

/**
 * PROTOTYPE-ONLY — ticket 26's UI-primitives round (buttons, inputs, form/validation states,
 * badges/status pills, loading/empty states). Not a real route in production: App.tsx only
 * mounts `/prototype/components` when `import.meta.env.DEV`. Switchable via `?variant=A|B|C`,
 * same PrototypeSwitcher as the header/footer round — reflects the whole chrome system together.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t py-8 first:border-t-0 first:pt-0">
      <p className="utility-label mb-4">{title}</p>
      {children}
    </section>
  )
}

type StatusKey = 'draft' | 'complete' | 'failed'
const STATUS_LABEL: Record<StatusKey, string> = { draft: 'Koncept', complete: 'Hotovo', failed: 'Selhalo' }

function StatusPill({ status, variant }: { status: StatusKey; variant: 'A' | 'B' | 'C' }) {
  if (variant === 'C') {
    // Bracketed terminal-readout text — no color, no border, evokes a wire/terminal status line.
    return (
      <span className="font-mono text-xs text-muted-foreground">[{STATUS_LABEL[status].toUpperCase()}]</span>
    )
  }
  if (variant === 'B') {
    // Outlined pill — a middle ground between a filled color badge and plain text.
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
          status === 'failed' && 'border-destructive text-destructive'
        )}
      >
        {STATUS_LABEL[status]}
      </span>
    )
  }
  // Variant A — plain uppercase small-caps text, the direction ticket 22 already chose for
  // HistoryPage; here it's applied consistently to every status/badge surface, not just history.
  return (
    <span className={cn('utility-label', status === 'failed' && 'text-destructive')}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export default function ComponentsPrototypePage() {
  const variant = useChromeVariant()
  const isTerminal = variant === 'C'
  const buttonRadius = isTerminal ? 'rounded-none' : variant === 'B' ? undefined : 'rounded-sm'
  const buttonVariant = isTerminal ? 'outline' : 'default'
  const inputClassName = cn(isTerminal && 'rounded-none font-mono')

  return (
    <PageContainer>
      <PageTitle>Komponenty (prototyp)</PageTitle>
      <p className="mt-2 text-sm text-muted-foreground">
        Ticket 26 — varianty tlačítek, polí, stavů formuláře, odznaků a stavů načítání/prázdného obsahu.
        Přepínejte pomocí ovladače dole.
      </p>

      <Section title="Tlačítka">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={buttonVariant} className={buttonRadius}>
            Uložit
          </Button>
          <Button variant="secondary" className={buttonRadius}>
            Zrušit
          </Button>
          <Button variant="destructive" className={buttonRadius}>
            Odstranit
          </Button>
          <Button variant="outline" className={buttonRadius}>
            Sekundární akce
          </Button>
          <Button variant={buttonVariant} className={buttonRadius} disabled>
            Odesílání…
          </Button>
        </div>
      </Section>

      <Section title="Pole a stavy validace">
        <div className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Běžné pole</label>
            <Input placeholder="admin@example.com" className={inputClassName} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Pole s chybou</label>
            <Input
              placeholder="admin@example.com"
              aria-invalid
              className={cn(inputClassName, 'border-destructive focus-visible:ring-destructive')}
            />
            <p className="text-xs text-destructive">Neplatný formát e-mailu.</p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Zakázané pole</label>
            <Input placeholder="Nelze upravit" disabled className={inputClassName} />
          </div>
        </div>
      </Section>

      <Section title="Odznaky / stavy">
        <div className="flex flex-wrap items-center gap-4">
          <StatusPill status="draft" variant={variant} />
          <StatusPill status="complete" variant={variant} />
          <StatusPill status="failed" variant={variant} />
        </div>
      </Section>

      <Section title="Načítání a prázdný stav">
        <div className="flex flex-col gap-4">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Načítání…
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-green-700">
            <CheckCircle size={14} /> Úspěšně dokončeno
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-destructive">
            <XCircle size={14} /> Něco se nepovedlo
          </span>
          <p className="text-sm text-muted-foreground">Zatím žádné položky.</p>
        </div>
      </Section>
    </PageContainer>
  )
}
