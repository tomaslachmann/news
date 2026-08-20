/** @type {import('tailwindcss').Config} */
export default {
  // Ticket 39 / ADR 0031: driven by data-theme on <html> (absent = follow prefers-color-scheme),
  // not Tailwind's older `.dark` class strategy — matches ds/tokens.css's own dark-mode selector.
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  // Ticket 39: the old semantic-colour theme.extend (border/background/foreground/primary/…,
  // all `hsl(var(--x))` reads of index.css's now-deleted :root/.dark blocks) is gone along with
  // the last page that used it. Tailwind is retained for layout utilities only, per the ticket's
  // own mechanics checklist — colour, typography and spacing come exclusively from ds/tokens.css.
  theme: {},
  plugins: [],
}
