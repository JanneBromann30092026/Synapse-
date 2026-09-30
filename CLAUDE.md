# Synapse – Karteikarten-Lern-App mit Wissensgehirn

## Vision
Synapse ist eine lokale Desktop-App (Windows primär, macOS sekundär) zum Lernen mit Karteikarten.
1. Primärfunktion: Karteikarten erstellen, in Projekten (Themen, z. B. "Japanisch", "BWL-Begriffe") organisieren und im Lernmodus abfragen. Der Nutzer tippt die Antwort ein, die App prüft sie (lokal + optional per KI), die Karte dreht sich um, eine grüne bzw. rote Animation zeigt das Ergebnis, die Karte landet auf dem Stapel "Richtig" oder "Falsch". Am Rundenende kann der Nutzer falsche, richtige oder alle Karten wiederholen. Ein Rundenstatus in Prozent zeigt den Anteil richtiger Antworten der aktuellen Runde (100 % = alle Karten dieser Runde richtig); er setzt sich mit jeder neuen Runde zurück.
2. Sekundärfunktion: Das "Gehirn" – eine große, frei verschiebbare und zoombare Wissenskarte, in der alle Karten aller Projekte als Knoten dargestellt und über semantische Ähnlichkeit (lokale Embeddings) miteinander verbunden sind. Projektübergreifende Verbindungen werden hervorgehoben. Der Lernstand jeder Karte beeinflusst ihre Darstellung (gut gelernt = leuchtend).

## Tech-Stack (verbindlich, nicht ohne Rückfrage ändern)
- Node.js 22 LTS (festgelegt über .nvmrc und "engines" in package.json)
- Electron (aktuelle stabile Version) mit electron-vite als Build-Tooling
- React 18+ mit TypeScript im strict-Modus (kein any, keine ts-ignore ohne Begründungskommentar)
- Tailwind CSS für Styling, Design-Tokens als CSS-Variablen
- Motion (ehemals Framer Motion, Paket "motion", Import aus "motion/react") für Animationen
- lucide-react für Icons
- Zustand für UI-State
- react-router (HashRouter) für Navigation
- SQLite über better-sqlite3 im Main-Prozess, eigene Migrationen
- @anthropic-ai/sdk im Main-Prozess für KI-Bewertung (Standardmodell: claude-haiku-4-5-20251001, konfigurierbar)
- @huggingface/transformers (transformers.js) in einem Web Worker für lokale Embeddings (Gehirn)
- react-force-graph-2d für die Gehirn-Visualisierung
- Vitest für Unit-Tests, ESLint + Prettier
- electron-builder für Packaging

## Architekturprinzipien
- Sicherheit: contextIsolation: true, nodeIntegration: false, sandbox wo möglich. Der Renderer hat keinen direkten Zugriff auf Node, Datenbank oder Netzwerk-APIs mit Secrets.
- Der Main-Prozess besitzt die Datenbank und alle KI-Aufrufe. Der Renderer kommuniziert ausschließlich über eine typisierte API, die im Preload per contextBridge als window.api bereitgestellt wird.
- IPC-Kanäle und deren Typen sind zentral in src/shared/ definiert (eine Quelle der Wahrheit für Main, Preload und Renderer).
- Datenbankzugriff nur über Repository-Module (src/main/db/repositories/*). Schemaänderungen nur über nummerierte Migrationen.
- Der API-Key wird niemals im Klartext gespeichert und niemals an den Renderer gesendet (Electron safeStorage).
- Reine Logik (Bewertung, Session-Zustandsmaschine, Ähnlichkeitsberechnung) liegt in framework-unabhängigen Modulen und ist mit Vitest getestet.
- Jede Antwort im Lernmodus wird dauerhaft protokolliert (Grundlage für Statistik, Beherrschungsgrad und Gehirn).

## Ordnerstruktur (Zielbild)
src/main/            – Electron Main-Prozess (Fenster, IPC-Handler, DB, KI, Backups)
src/main/db/         – Verbindung, Migrationen, Repositories
src/main/ai/         – KI-Provider und Bewertungslogik
src/preload/         – contextBridge-API
src/shared/          – gemeinsame Typen, IPC-Verträge, reine Hilfsfunktionen
src/renderer/        – React-App
src/renderer/components/ui/  – Design-System-Komponenten
src/renderer/features/       – projects, cards, study, brain, stats, settings
src/renderer/styles/         – Tokens, globale Styles
src/renderer/workers/        – Web Worker (Embeddings)
src/renderer/i18n/de.ts      – alle UI-Texte zentral (Deutsch)

## Design-Leitlinien
Schlicht, modern, ruhig. Abgerundete, geometrische Formen (große Radien, Pill-Buttons, Kreise), viel Weißraum, klare Typografie (Inter), dezente Tiefe durch weiche Schatten und feine Ränder statt harter Linien. Animierte Übergänge überall, aber kurz und federnd (Spring-Animationen), niemals verspielt-chaotisch. Visuelle Effekte (Glows, Partikel, sanfte Farbverläufe) gezielt an Schlüsselmomenten: Kartenumdrehen, Richtig/Falsch, Rundenende, Gehirn. Dark Mode und Light Mode, Standard folgt dem System. prefers-reduced-motion wird respektiert. Die genauen Tokens stehen in src/renderer/styles/tokens.css, sobald sie angelegt sind.

## Konventionen
- UI-Sprache Deutsch, Code/Variablen/Kommentare Englisch.
- Keine hartkodierten UI-Texte in Komponenten – alles aus src/renderer/i18n/de.ts.
- IDs sind UUIDs (crypto.randomUUID), Zeitstempel als ISO-Strings in UTC.
- Jeder Schritt endet mit: npm run typecheck, npm run lint und npm run test ohne Fehler.
- Implementiere immer nur den aktuell beauftragten Schritt. Baue keine Features künftiger Schritte vor, verbaue sie aber auch nicht.
- Nach Abschluss eines Schritts: Roadmap unten abhaken und unter "Entscheidungen & Notizen" wichtige Abweichungen oder Erkenntnisse kurz dokumentieren.

## Roadmap
- [ ] 1 Projekt-Setup & Grundgerüst
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
- [ ] 16 Feinschliff & Packaging

## Entscheidungen & Notizen
(wird im Verlauf ergänzt)
