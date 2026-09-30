import { cardsRepo, projectsRepo } from '@/data/repositories';
import type { ProjectColor } from '@/data/types';

/**
 * Demo content for the developer area. Deliberate overlaps between "BWL-Grundbegriffe" and
 * "Aktien & Börse" (Cashflow, Eigenkapitalrendite, Eigenkapitalquote, KGV …) give the brain
 * (steps 12–14) cross-project links to show.
 */
interface DemoCard {
  front: string;
  back: string;
  notes?: string;
  tags: string[];
}

interface DemoProject {
  name: string;
  description: string;
  color: ProjectColor;
  icon: string;
  cards: DemoCard[];
}

const jp = (front: string, back: string, notes: string, ...tags: string[]): DemoCard => ({
  front,
  back,
  notes,
  tags,
});
const term = (front: string, back: string, ...tags: string[]): DemoCard => ({ front, back, tags });

export const DEMO_PROJECTS: DemoProject[] = [
  {
    name: 'Japanisch Grundwortschatz',
    description: 'Die wichtigsten Wörter für den Alltag – mit Kanji, Kana und Lesung.',
    color: 'rose',
    icon: 'languages',
    cards: [
      jp('犬', 'Hund', 'いぬ · inu', 'Nomen', 'Tiere'),
      jp('猫', 'Katze', 'ねこ · neko', 'Nomen', 'Tiere'),
      jp('水', 'Wasser', 'みず · mizu', 'Nomen', 'Alltag'),
      jp('お茶', 'Tee; grüner Tee', 'おちゃ · ocha', 'Nomen', 'Alltag'),
      jp('家', 'Haus; Heim; Zuhause', 'いえ · ie', 'Nomen', 'Alltag'),
      jp('学校', 'Schule', 'がっこう · gakkō', 'Nomen', 'Bildung'),
      jp('先生', 'Lehrer; Lehrerin', 'せんせい · sensei', 'Nomen', 'Bildung'),
      jp('学生', 'Student; Studentin', 'がくせい · gakusei', 'Nomen', 'Bildung'),
      jp('友達', 'Freund; Freundin', 'ともだち · tomodachi', 'Nomen', 'Menschen'),
      jp('本', 'Buch', 'ほん · hon', 'Nomen', 'Bildung'),
      jp('車', 'Auto; Wagen', 'くるま · kuruma', 'Nomen', 'Verkehr'),
      jp('電車', 'Zug; Bahn', 'でんしゃ · densha', 'Nomen', 'Verkehr'),
      jp('駅', 'Bahnhof; Station', 'えき · eki', 'Nomen', 'Verkehr'),
      jp('お金', 'Geld', 'おかね · okane', 'Nomen', 'Alltag'),
      jp('時間', 'Zeit; Stunde', 'じかん · jikan', 'Nomen', 'Zeit'),
      jp('今日', 'heute', 'きょう · kyō', 'Zeit'),
      jp('明日', 'morgen', 'あした · ashita', 'Zeit'),
      jp('食べる', 'essen', 'たべる · taberu', 'Verb'),
      jp('飲む', 'trinken', 'のむ · nomu', 'Verb'),
      jp('行く', 'gehen; fahren', 'いく · iku', 'Verb'),
      jp('来る', 'kommen', 'くる · kuru', 'Verb'),
      jp('見る', 'sehen; schauen; ansehen', 'みる · miru', 'Verb'),
      jp('分かる', 'verstehen', 'わかる · wakaru', 'Verb'),
      jp('大きい', 'groß', 'おおきい · ōkii', 'Adjektiv'),
      jp('小さい', 'klein', 'ちいさい · chiisai', 'Adjektiv'),
      jp('新しい', 'neu', 'あたらしい · atarashii', 'Adjektiv'),
      jp('高い', 'teuer; hoch', 'たかい · takai', 'Adjektiv'),
      jp('安い', 'billig; günstig', 'やすい · yasui', 'Adjektiv'),
      jp('ありがとう', 'danke', 'arigatō', 'Ausdruck'),
      jp('すみません', 'Entschuldigung; Verzeihung', 'sumimasen', 'Ausdruck'),
    ],
  },
  {
    name: 'BWL-Grundbegriffe',
    description: 'Rechnungswesen, Finanzierung, Kostenrechnung und Marketing kompakt.',
    color: 'indigo',
    icon: 'briefcase',
    cards: [
      term(
        'Liquidität',
        'Fähigkeit eines Unternehmens, seine Zahlungsverpflichtungen fristgerecht zu erfüllen',
        'Finanzierung',
      ),
      term('Rentabilität', 'Verhältnis von Gewinn zum eingesetzten Kapital', 'Kennzahlen'),
      term(
        'Eigenkapital',
        'Mittel, die die Eigentümer dem Unternehmen dauerhaft zur Verfügung stellen; Vermögen minus Schulden',
        'Finanzierung',
        'Bilanz',
      ),
      term(
        'Fremdkapital',
        'Kapital von Gläubigern, z. B. Kredite und Verbindlichkeiten, das zurückgezahlt werden muss',
        'Finanzierung',
        'Bilanz',
      ),
      term(
        'Cashflow',
        'Zahlungsmittelüberschuss einer Periode; zeigt die Innenfinanzierungskraft',
        'Kennzahlen',
        'Finanzierung',
      ),
      term(
        'Abschreibung',
        'Erfassung des Wertverlusts von Anlagevermögen als Aufwand über die Nutzungsdauer',
        'Rechnungswesen',
      ),
      term(
        'Bilanz',
        'Gegenüberstellung von Vermögen (Aktiva) und Kapital (Passiva) zu einem Stichtag',
        'Rechnungswesen',
        'Bilanz',
      ),
      term(
        'GuV',
        'Gewinn- und Verlustrechnung: Erträge und Aufwendungen einer Periode',
        'Rechnungswesen',
      ),
      term(
        'Break-even-Point',
        'Menge, bei der Erlöse und Gesamtkosten gleich sind; Gewinnschwelle',
        'Kostenrechnung',
      ),
      term(
        'Deckungsbeitrag',
        'Umsatzerlöse minus variable Kosten; deckt die Fixkosten',
        'Kostenrechnung',
      ),
      term(
        'Fixkosten',
        'Kosten, die unabhängig von der Produktionsmenge anfallen, z. B. Miete',
        'Kostenrechnung',
      ),
      term(
        'Variable Kosten',
        'Kosten, die mit der Produktionsmenge steigen oder sinken, z. B. Material',
        'Kostenrechnung',
      ),
      term('Umsatz', 'Verkaufte Menge mal Verkaufspreis in einer Periode; Erlös', 'Grundlagen'),
      term('Gewinn', 'Positive Differenz aus Erträgen und Aufwendungen', 'Grundlagen'),
      term(
        'Eigenkapitalquote',
        'Anteil des Eigenkapitals am Gesamtkapital; Maß für finanzielle Stabilität',
        'Kennzahlen',
        'Bilanz',
      ),
      term(
        'Eigenkapitalrendite',
        'Gewinn im Verhältnis zum Eigenkapital (Return on Equity)',
        'Kennzahlen',
      ),
      term(
        'Verschuldungsgrad',
        'Verhältnis von Fremdkapital zu Eigenkapital',
        'Kennzahlen',
        'Bilanz',
      ),
      term(
        'Anlagevermögen',
        'Vermögensgegenstände, die dem Unternehmen dauerhaft dienen, z. B. Maschinen und Gebäude',
        'Bilanz',
      ),
      term(
        'Umlaufvermögen',
        'Vermögen, das nur kurzfristig im Unternehmen bleibt, z. B. Vorräte, Forderungen, Kasse',
        'Bilanz',
      ),
      term(
        'Working Capital',
        'Umlaufvermögen minus kurzfristige Verbindlichkeiten',
        'Kennzahlen',
        'Finanzierung',
      ),
      term(
        'Investition',
        'Einsatz finanzieller Mittel für Vermögensgegenstände, um künftige Erträge zu erzielen',
        'Finanzierung',
      ),
      term(
        'Opportunitätskosten',
        'Entgangener Nutzen der besten nicht gewählten Alternative',
        'Grundlagen',
      ),
      term('Skonto', 'Preisnachlass bei Zahlung innerhalb einer kurzen Frist', 'Rechnungswesen'),
      term(
        'Rückstellungen',
        'Passivposten für ungewisse Verbindlichkeiten, deren Höhe oder Fälligkeit noch offen ist',
        'Bilanz',
      ),
      term(
        'EBIT',
        'Ergebnis vor Zinsen und Steuern (Earnings Before Interest and Taxes)',
        'Kennzahlen',
      ),
      term('Marktanteil', 'Anteil eines Unternehmens am Gesamtumsatz eines Marktes', 'Marketing'),
      term(
        'Marketing-Mix',
        'Kombination aus Produkt, Preis, Distribution und Kommunikation (4 P)',
        'Marketing',
      ),
      term(
        'Zielgruppe',
        'Personengruppe, die mit einem Angebot gezielt angesprochen werden soll',
        'Marketing',
      ),
      term(
        'Leverage-Effekt',
        'Steigerung der Eigenkapitalrendite durch Fremdkapital, solange dessen Zins unter der Gesamtkapitalrendite liegt',
        'Finanzierung',
        'Kennzahlen',
      ),
      term(
        'Stakeholder',
        'Anspruchsgruppen eines Unternehmens, z. B. Kunden, Mitarbeitende, Lieferanten, Kapitalgeber',
        'Grundlagen',
      ),
    ],
  },
  {
    name: 'Aktien & Börse',
    description: 'Begriffe und Kennzahlen rund um Aktien, Handel und Bewertung.',
    color: 'emerald',
    icon: 'chart-line',
    cards: [
      term(
        'Aktie',
        'Wertpapier, das einen Anteil am Grundkapital einer Aktiengesellschaft verbrieft',
        'Grundlagen',
      ),
      term('Dividende', 'Gewinnausschüttung einer Aktiengesellschaft an ihre Aktionäre', 'Ertrag'),
      term(
        'Dividendenrendite',
        'Dividende je Aktie im Verhältnis zum Aktienkurs',
        'Kennzahlen',
        'Ertrag',
      ),
      term(
        'KGV',
        'Kurs-Gewinn-Verhältnis: Aktienkurs geteilt durch den Gewinn je Aktie',
        'Kennzahlen',
        'Bewertung',
      ),
      term(
        'Gewinn je Aktie',
        'Jahresüberschuss geteilt durch die Anzahl der Aktien (EPS)',
        'Kennzahlen',
      ),
      term(
        'Marktkapitalisierung',
        'Börsenwert eines Unternehmens: Aktienkurs mal Anzahl der Aktien',
        'Bewertung',
      ),
      term(
        'Eigenkapitalrendite',
        'Jahresüberschuss im Verhältnis zum Eigenkapital; zeigt, wie profitabel das Kapital der Aktionäre arbeitet',
        'Kennzahlen',
      ),
      term(
        'Kurs-Buchwert-Verhältnis',
        'Aktienkurs im Verhältnis zum bilanziellen Eigenkapital je Aktie',
        'Kennzahlen',
        'Bewertung',
      ),
      term(
        'Free Cashflow',
        'Operativer Cashflow minus Investitionen; bleibt für Dividenden und Schuldenabbau',
        'Kennzahlen',
      ),
      term(
        'Cashflow',
        'Zahlungsmittelzufluss aus der Geschäftstätigkeit; wichtige Grundlage der Unternehmensbewertung',
        'Kennzahlen',
        'Bewertung',
      ),
      term('Volatilität', 'Maß für die Schwankungsbreite eines Kurses in einem Zeitraum', 'Risiko'),
      term(
        'Diversifikation',
        'Streuung des Kapitals auf verschiedene Anlagen, um Risiken zu verringern',
        'Risiko',
        'Strategie',
      ),
      term('ETF', 'Börsengehandelter Indexfonds, der einen Index wie den DAX abbildet', 'Produkte'),
      term(
        'Index',
        'Kennzahl für die Kursentwicklung eines Korbs von Wertpapieren, z. B. DAX',
        'Grundlagen',
      ),
      term(
        'Bulle',
        'Symbol für steigende Kurse; Anleger, der auf steigende Kurse setzt',
        'Börsensprache',
      ),
      term(
        'Bär',
        'Symbol für fallende Kurse; Anleger, der auf fallende Kurse setzt',
        'Börsensprache',
      ),
      term(
        'Leerverkauf',
        'Verkauf geliehener Aktien in der Erwartung, sie später günstiger zurückzukaufen',
        'Strategie',
      ),
      term('Orderbuch', 'Übersicht aller Kauf- und Verkaufsaufträge für ein Wertpapier', 'Handel'),
      term(
        'Limit-Order',
        'Auftrag, der nur zu einem festgelegten Höchst- bzw. Mindestpreis ausgeführt wird',
        'Handel',
      ),
      term('Spread', 'Differenz zwischen Geld- und Briefkurs', 'Handel'),
      term(
        'Marktliquidität',
        'Wie leicht sich ein Wertpapier ohne große Kursänderung handeln lässt',
        'Handel',
      ),
      term(
        'Börsengang',
        'Erstmaliges öffentliches Angebot von Aktien an der Börse (IPO)',
        'Grundlagen',
      ),
      term(
        'Hauptversammlung',
        'Jährliche Versammlung der Aktionäre, die u. a. über die Dividende beschließt',
        'Grundlagen',
      ),
      term(
        'Eigenkapitalquote',
        'Anteil des Eigenkapitals an der Bilanzsumme; zeigt die Stabilität einer AG',
        'Kennzahlen',
      ),
      term(
        'Bilanzkennzahlen',
        'Aus der Bilanz abgeleitete Kennzahlen wie Eigenkapitalquote, Verschuldungsgrad oder Anlagendeckung',
        'Kennzahlen',
      ),
      term(
        'Aktienrückkauf',
        'Kauf eigener Aktien durch das Unternehmen; erhöht den Gewinn je Aktie',
        'Ertrag',
      ),
      term(
        'Rendite',
        'Gesamtertrag einer Anlage (Kursgewinn plus Dividenden) im Verhältnis zum eingesetzten Kapital',
        'Ertrag',
      ),
      term(
        'Zinseszins',
        'Verzinsung bereits erhaltener und wieder angelegter Erträge',
        'Grundlagen',
      ),
      term(
        'Blue Chip',
        'Aktie eines großen, etablierten und finanzstarken Unternehmens',
        'Börsensprache',
      ),
      term(
        'Beta-Faktor',
        'Maß dafür, wie stark eine Aktie im Vergleich zum Gesamtmarkt schwankt',
        'Risiko',
        'Kennzahlen',
      ),
    ],
  },
];

/**
 * Creates the demo projects that do not exist yet (matched by name). Running it again does
 * not create duplicates. Returns how many projects and cards were created.
 */
export async function loadDemoData(): Promise<{ projects: number; cards: number }> {
  const existing = new Set((await projectsRepo.list()).map((project) => project.name));
  let projects = 0;
  let cards = 0;
  for (const demo of DEMO_PROJECTS) {
    if (existing.has(demo.name)) continue;
    const project = await projectsRepo.create({
      name: demo.name,
      description: demo.description,
      color: demo.color,
      icon: demo.icon,
    });
    const created = await cardsRepo.bulkCreate(project.id, demo.cards);
    projects += 1;
    cards += created.length;
  }
  return { projects, cards };
}
