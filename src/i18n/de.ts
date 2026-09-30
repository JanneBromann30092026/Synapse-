/** All user-facing texts (German). Components must not hard-code UI strings. */
export const de = {
  app: {
    name: 'Synapse',
    tagline: 'Karteikarten lernen – mit Wissensgehirn.',
  },
  start: {
    title: 'Das Grundgerüst steht',
    intro:
      'Hier entsteht deine Karteikarten-App. Diese Seite zeigt vorerst nur, ob Installation und Speicher funktionieren.',
    statusHeading: 'Systemstatus',
    version: 'App-Version',
    buildTime: 'Build-Zeitpunkt',
    launchMode: 'Gestartet als',
    launchStandalone: 'Homescreen-App',
    launchBrowser: 'Browser-Tab',
    persisted: 'Dauerhafter Speicher gewährt',
    storageUsed: 'Belegter Speicher',
    storageOf: 'von',
    yes: 'Ja',
    no: 'Nein',
    unsupported: 'Nicht unterstützt',
    loading: 'Wird geprüft …',
    installHint:
      'Tipp: In Safari über „Teilen“ → „Zum Home-Bildschirm“ installieren. Nur so bleiben deine Daten zuverlässig erhalten.',
  },
  pwa: {
    updateAvailable: 'Update verfügbar',
    reload: 'Neu laden',
    offlineReady: 'App ist jetzt offline verfügbar',
    dismiss: 'Schließen',
  },
} as const;
