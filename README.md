# Synapse

Karteikarten lernen – mit Wissensgehirn. Synapse ist eine Progressive Web App für das iPad:
Sie läuft komplett im Browser, speichert alles lokal auf dem Gerät und funktioniert offline.

**App öffnen:** https://jannebromann30092026.github.io/Synapse-/

<p>
  <img src="docs/screenshots/projects.png" alt="Projektübersicht" width="49%" />
  <img src="docs/screenshots/study.png" alt="Lernmodus mit umgedrehter Karte" width="49%" />
</p>
<p>
  <img src="docs/screenshots/summary.png" alt="Rundenende mit Auswertung" width="49%" />
  <img src="docs/screenshots/brain.png" alt="Wissensgehirn" width="49%" />
</p>

## Funktionen

- **Projekte & Karten** – Karten nach Themen ordnen, schnell erfassen (Return springt zur
  Rückseite), Tags, Suche, Wischgesten, Drag & Drop.
- **Lernmodus** – Antwort eintippen, Synapse prüft sie (exakt, Tippfehler, Umlaute, Artikel,
  Mehrfachantworten). Die Karte dreht sich um und landet auf „Richtig“ oder „Falsch“. Am
  Rundenende falsche, richtige oder alle Karten wiederholen.
- **KI-Bewertung (optional)** – mit eigenem Anthropic-API-Key bewertet Claude auch
  Umschreibungen und Synonyme. Ohne Key bewertet Synapse kostenlos lokal; was unklar bleibt,
  entscheidest du selbst.
- **Statistik** – Beherrschungsgrad pro Karte und Projekt, Lernserie, Aktivitäts-Heatmap,
  schwierigste Karten als eigene Runde.
- **Wissensgehirn** – alle Karten als Netzwerk, verbunden über semantische Ähnlichkeit
  (lokales Sprachmodell, ca. 140 MB einmaliger Download). Zoomen, verschieben, Karten antippen,
  Nachbarschaft lernen, Verbindungen erklären lassen.
- **Import & Export** – CSV-Import, Export und Backups (siehe unten).
- **Für das iPad gemacht** – Touch-Gesten mit Button-Alternative, Hoch- und Querformat,
  Split View, Bildschirmtastatur, Hardware-Tastatur (Übersicht mit `?`), Dark und Light Mode,
  reduzierte Bewegung.

## Installation auf dem iPad

1. https://jannebromann30092026.github.io/Synapse-/ in **Safari** öffnen.
2. Oben auf das **Teilen-Symbol** tippen → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Synapse ab jetzt über das neue Symbol starten. Die App öffnet im Vollbild, läuft offline und
   Safari markiert ihre Daten als dauerhaft.

Neue Versionen lädt die App im Hintergrund; ein Hinweis „Update verfügbar – Neu laden“ erscheint
dann unten.

## Daten & Backups

- Alle Projekte, Karten und Lernstände liegen nur in der lokalen Datenbank (IndexedDB) auf dem
  Gerät. Es gibt keinen Server und kein Konto.
- Beim Start fordert Synapse dauerhaften Speicher an (Einstellungen → Speicher zeigt den Status).
- Weil eine Web-App keine automatischen Datei-Backups anlegen kann, **exportiere regelmäßig ein
  Backup** (Einstellungen → Daten) und lege die Datei in der Dateien-App oder in iCloud ab. Die App
  erinnert dich daran.
- Der API-Key wird nie exportiert und ist in keinem Backup enthalten.
- Bei Problemen: Einstellungen → Fehlerprotokoll → „Fehlerprotokoll kopieren“ und den Text
  mitschicken. Das Protokoll enthält keinen API-Key und keine vollständigen Karteninhalte.

## Datenschutz & KI

Ohne KI verlässt nichts das Gerät. Ist die KI-Bewertung aktiv, gehen pro Bewertung nur Vorder-
und Rückseite der Karte und deine Antwort an die Anthropic-API (direkt aus dem Browser, mit deinem
eigenen Key). Erklärungen von Gehirn-Verbindungen schicken die Texte der beiden Karten. Das
Sprachmodell für das Gehirn wird einmalig von Hugging Face geladen und läuft danach lokal.

## Entwicklung

Voraussetzungen: Node.js 22 (siehe `.nvmrc`).

```bash
ONNXRUNTIME_NODE_INSTALL=skip npm ci   # ohne CUDA-Download von onnxruntime-node
npm run dev                            # Dev-Server
npm run typecheck && npm run lint && npm run test && npm run build
npm run e2e                            # Playwright gegen vite preview (iPad-Profile)
npm run screenshots                    # iPad-Screenshots nach screenshots/
npm run icons                          # Icons und Startbildschirme aus public/icons/favicon.svg
```

Tech-Stack: Vite, React, TypeScript (strict), Tailwind CSS, Motion, Zustand, Dexie (IndexedDB),
zod, vite-plugin-pwa, transformers.js (Web Worker), react-force-graph-2d, Vitest, Playwright.
Architektur, Konventionen und Entscheidungen stehen in [CLAUDE.md](CLAUDE.md).

Deployment: Jeder Push auf `main` baut und veröffentlicht die App per GitHub Actions auf GitHub
Pages. Pull Requests laufen durch typecheck, lint, format, test, build und e2e.

Entwicklerwerkzeuge (Komponentenübersicht, Demo-Daten, Lernverlauf simulieren, synthetische
Großdaten im Gehirn) erscheinen nach Einstellungen → Entwicklermodus.
