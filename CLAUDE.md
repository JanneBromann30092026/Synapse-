# Synapse – Karteikarten-Lern-App mit Wissensgehirn

## Vision
Synapse ist eine Progressive Web App (PWA) zum Lernen mit Karteikarten. Primäres Zielgerät ist ein **iPad (Safari, als Homescreen-App installiert)**, bedient per Touch und optional mit Hardware-Tastatur. Die App läuft vollständig im Browser, speichert alle Daten lokal auf dem Gerät und funktioniert offline (außer KI-Bewertung und erstmaliger Modell-Download).
1. Primärfunktion: Karteikarten erstellen, in Projekten (Themen, z. B. "Japanisch", "BWL-Begriffe") organisieren und im Lernmodus abfragen. Der Nutzer tippt die Antwort ein, die App prüft sie (lokal + optional per KI), die Karte dreht sich um, eine grüne bzw. rote Animation zeigt das Ergebnis, die Karte landet auf dem Stapel "Richtig" oder "Falsch". Am Rundenende kann der Nutzer falsche, richtige oder alle Karten wiederholen. Ein Rundenstatus in Prozent zeigt den Anteil richtiger Antworten der aktuellen Runde (100 % = alle Karten dieser Runde richtig); er setzt sich mit jeder neuen Runde zurück.
2. Sekundärfunktion: Das "Gehirn" – eine große, frei verschiebbare und zoombare Wissenskarte (Touch: Ziehen, Pinch-Zoom), in der alle Karten aller Projekte als Knoten dargestellt und über semantische Ähnlichkeit (lokale Embeddings) miteinander verbunden sind. Projektübergreifende Verbindungen werden hervorgehoben. Der Lernstand jeder Karte beeinflusst ihre Darstellung (gut gelernt = leuchtend).

## Arbeitsumgebung (wichtig)
- Der Nutzer hat **nur ein iPad**, keinen Rechner. Entwickelt wird ausschließlich in Claude-Code-Cloud-Sitzungen. Der Nutzer kann keine Befehle lokal ausführen und keinen Dev-Server öffnen.
- Der Nutzer sieht die App nur über das Deployment auf GitHub Pages: https://jannebromann30092026.github.io/Synapse-/ (Deploy automatisch per GitHub Actions bei jedem Push auf main).
- Deshalb gilt für jeden Schritt: Die App selbst mit Playwright (vorinstalliertes Chromium, kein "playwright install") gegen den Production-Build (vite preview) prüfen und **Screenshots im iPad-Format** (Querformat 1180×820 und Hochformat 820×1180, deviceScaleFactor 2, hasTouch, isMobile) erstellen und dem Nutzer zeigen.
- Entwicklerwerkzeuge (Komponentenübersicht, Demo-Daten, synthetische Großdaten) müssen auch im Production-Build erreichbar sein, versteckt hinter einem Schalter "Entwicklermodus" in den Einstellungen.
- Arbeite auf einem Feature-Branch und erstelle am Ende einen Pull Request mit kurzer deutscher Beschreibung, was der Nutzer nach dem Mergen auf dem iPad prüfen soll.

## Tech-Stack (verbindlich, nicht ohne Rückfrage ändern)
- Node.js 22 LTS (festgelegt über .nvmrc und "engines" in package.json)
- Vite + React 18+ mit TypeScript im strict-Modus (kein any, keine ts-ignore ohne Begründungskommentar)
- vite-plugin-pwa (Workbox) für Manifest, Service Worker, Offline-Fähigkeit und Update-Hinweis
- Tailwind CSS für Styling, Design-Tokens als CSS-Variablen
- Motion (ehemals Framer Motion, Paket "motion", Import aus "motion/react") für Animationen
- lucide-react für Icons
- Zustand für UI-State
- react-router (HashRouter, passend für GitHub Pages) für Navigation
- Dexie.js (IndexedDB) als lokale Datenbank, versioniertes Schema als Migrationen
- zod für Validierung
- @anthropic-ai/sdk direkt im Browser (dangerouslyAllowBrowser: true) für KI-Bewertung (Standardmodell: claude-haiku-4-5-20251001, konfigurierbar)
- @huggingface/transformers (transformers.js) in einem Web Worker für lokale Embeddings (Gehirn)
- react-force-graph-2d für die Gehirn-Visualisierung
- Vitest (+ fake-indexeddb) für Unit-Tests, Playwright für Smoke-Tests und Screenshots, ESLint + Prettier
- Deployment: GitHub Actions → GitHub Pages (Vite base: "/Synapse-/")

## Architekturprinzipien
- Alle Daten bleiben auf dem Gerät (IndexedDB). Beim Start navigator.storage.persist() anfordern, damit Safari die Daten nicht löscht. Regelmäßige Export-Erinnerung, weil es keinen Dateisystem-Zugriff für automatische Backups gibt.
- Datenzugriff nur über Repository-Module (src/data/repositories/*). Komponenten greifen nie direkt auf Dexie zu. Schemaänderungen nur über neue Dexie-Versionen mit upgrade-Funktion.
- Der API-Key liegt ausschließlich lokal in einer eigenen IndexedDB-Tabelle "secrets", wird nie geloggt, nie exportiert, nie in Backups übernommen und in der UI nie wieder im Klartext angezeigt (nur "Key hinterlegt"). Im Repository gibt es keinerlei Secrets.
- KI-Aufrufe laufen gekapselt über src/services/ai/*; UI-Komponenten rufen nie das SDK direkt auf.
- Reine Logik (Bewertung, Session-Zustandsmaschine, Ähnlichkeitsberechnung, Beherrschungsgrad) liegt in framework-unabhängigen Modulen unter src/core/ und ist mit Vitest getestet.
- Jede Antwort im Lernmodus wird dauerhaft protokolliert (Grundlage für Statistik, Beherrschungsgrad und Gehirn).
- Content-Security-Policy per meta-Tag, so restriktiv wie möglich; nur gezielt erweitern (api.anthropic.com, später Hugging Face für den Modell-Download).

## Ordnerstruktur (Zielbild)
src/core/            – reine Logik ohne React/Browser-APIs (grading, session, mastery, brain)
src/data/            – Dexie-Datenbank, Schema/Migrationen, Repositories, Typen
src/services/        – KI-Provider, Backup/Export, Embedding-Sync
src/app/             – App-Root, Router, Shell
src/components/ui/   – Design-System-Komponenten
src/features/        – projects, cards, study, brain, stats, settings, dev
src/styles/          – Tokens, globale Styles, motion.ts
src/workers/         – Web Worker (Embeddings, Link-Berechnung)
src/i18n/de.ts       – alle UI-Texte zentral (Deutsch)
e2e/                 – Playwright-Tests und Screenshot-Skript

## Design-Leitlinien
Schlicht, modern, ruhig. Abgerundete, geometrische Formen (große Radien, Pill-Buttons, Kreise), viel Weißraum, klare Typografie (Inter), dezente Tiefe durch weiche Schatten und feine Ränder statt harter Linien. Animierte Übergänge überall, aber kurz und federnd (Spring-Animationen), niemals verspielt-chaotisch. Visuelle Effekte (Glows, Partikel, sanfte Farbverläufe) gezielt an Schlüsselmomenten: Kartenumdrehen, Richtig/Falsch, Rundenende, Gehirn. Dark Mode und Light Mode, Standard folgt dem System. prefers-reduced-motion wird respektiert. Die genauen Tokens stehen in src/styles/tokens.css, sobald sie angelegt sind.

Touch-first (iPad):
- Tippflächen mindestens 44×44 px. Nichts darf nur per Hover erreichbar sein; Hover-Effekte nur unter @media (hover: hover).
- Safe Areas (env(safe-area-inset-*)), Höhen mit dvh, kein ungewolltes Scrollen/Bounce der gesamten Seite.
- Bildschirmtastatur: Layouts mit visualViewport so anpassen, dass Eingabefeld und Karte sichtbar bleiben.
- Gesten, wo sinnvoll (Wischen, Long-Press), aber immer mit sichtbarer Button-Alternative.
- Tastaturkürzel zusätzlich für Hardware-Tastaturen.
- Hoch- und Querformat, Split View (ab ca. 500 px Breite) sauber unterstützen.

## Konventionen
- UI-Sprache Deutsch, Code/Variablen/Kommentare Englisch.
- Keine hartkodierten UI-Texte in Komponenten – alles aus src/i18n/de.ts.
- IDs sind UUIDs (crypto.randomUUID), Zeitstempel als ISO-Strings in UTC.
- Jeder Schritt endet mit: npm run typecheck, npm run lint, npm run test und npm run build ohne Fehler, plus Playwright-Screenshots.
- Implementiere immer nur den aktuell beauftragten Schritt. Baue keine Features künftiger Schritte vor, verbaue sie aber auch nicht.
- Nach Abschluss eines Schritts: Roadmap unten abhaken und unter "Entscheidungen & Notizen" wichtige Abweichungen oder Erkenntnisse kurz dokumentieren.

## Roadmap
- [x] 0 Projektkontext (CLAUDE.md)
- [x] 1 Projekt-Setup, PWA & Deployment
- [ ] 2 Datenbank & Datenmodell
- [ ] 3 Design-System & App-Shell
- [ ] 4 Projektverwaltung
- [ ] 5 Karteikartenverwaltung
- [ ] 6 Einstellungen & KI-Anbindung
- [ ] 7 Bewertungs-Engine
- [ ] 8 Lernmodus – Session-Logik
- [ ] 9 Lernmodus – UI & Animationen
- [ ] 10 Lernmodus – Rundenende & Wiederholung
- [ ] 11 Lernhistorie & Statistik
- [ ] 12 Gehirn – lokale Embeddings & Verknüpfungen
- [ ] 13 Gehirn – Visualisierung
- [ ] 14 Gehirn – Interaktion
- [ ] 15 Import, Export & Backups
- [ ] 16 Feinschliff & Installation

## Entscheidungen & Notizen
- Ursprünglich als Electron-Desktop-App geplant; umgestellt auf PWA, weil nur ein iPad zur Verfügung steht. Folgen: IndexedDB statt SQLite, kein Main-Prozess/IPC, KI-Aufruf direkt aus dem Browser, kein Ollama, Backups als Export statt Dateikopie.
- Schritt 1: Aktuelle Versionen gewählt: Vite 8, React 19, Tailwind 4 (@tailwindcss/vite, keine tailwind.config), react-router 8 (Import aus "react-router", nicht react-router-dom), zod 4, Vitest 5, ESLint 10 (Flat Config, type-aware). TypeScript ist auf ~6.0 gepinnt, weil typescript-eslint < 6.1 verlangt. @playwright/test exakt 1.56.1, passend zum vorinstallierten Chromium (chromium-1194) im Cloud-Container.
- CSP wird nur im Production-Build per Vite-Plugin (vite.config.ts, `cspPlugin`) als erstes meta-Tag eingefügt; der Dev-Server braucht Inline-Skripte. Aktuell kein 'unsafe-inline' (auch nicht für Styles). frame-ancestors fehlt bewusst (in meta-Tags wirkungslos, erzeugt Konsolenfehler).
- Service Worker: vite-plugin-pwa generateSW, registerType "prompt" – Hinweis "Update verfügbar" mit "Neu laden" (src/app/UpdatePrompt.tsx), stündliche Update-Prüfung, einmaliger Hinweis "offline verfügbar".
- Icons: public/icons/favicon.svg ist die Quelle; PNGs mit `npm run icons` (sharp) erzeugen und einchecken.
- Playwright: iPad-Profile in e2e/ipad.ts (Chromium mit iPad-User-Agent, de-DE, Europe/Berlin). `npm run e2e` baut und startet vite preview selbst; Smoke-Test prüft Konsolenfehler, Manifest und Offline-Betrieb. `npm run screenshots` erzeugt screenshots/<name>-{landscape,portrait}-{dark,light}.png (Service Worker dort blockiert, damit kein Toast im Bild ist).
- CI: .github/workflows/ci.yml (PRs: typecheck, lint, format:check, test, build, e2e), deploy.yml (Push auf main → GitHub Pages). Voraussetzung: Settings → Pages → Source "GitHub Actions".
