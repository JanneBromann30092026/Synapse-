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
    databaseHeading: 'Datenbank',
    databaseStatus: 'Lokale Datenbank',
    databaseReady: 'Bereit',
    projectCount: 'Projekte',
    createTestProject: 'Testprojekt anlegen',
    testProjectName: (n: number) => `Testprojekt ${n}`,
    testProjectHint:
      'Lege ein Testprojekt an und lade die Seite neu – die Anzahl muss erhalten bleiben.',
    saveFailed: 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
    installHint:
      'Tipp: In Safari über „Teilen“ → „Zum Home-Bildschirm“ installieren. Nur so bleiben deine Daten zuverlässig erhalten.',
  },
  database: {
    errors: {
      unavailable:
        'Die lokale Datenbank ist nicht verfügbar. Bitte nicht im privaten Modus öffnen und Website-Daten in den Safari-Einstellungen erlauben.',
      quota: 'Der Gerätespeicher ist voll. Bitte Speicher freigeben und die App neu starten.',
      version:
        'Die gespeicherten Daten stammen aus einer neueren App-Version. Bitte die App neu laden, um das Update zu erhalten.',
      unknown: 'Die lokale Datenbank konnte nicht geöffnet werden. Bitte die App neu starten.',
    },
  },
  pwa: {
    updateAvailable: 'Update verfügbar',
    reload: 'Neu laden',
    offlineReady: 'App ist jetzt offline verfügbar',
    dismiss: 'Schließen',
  },
} as const;
