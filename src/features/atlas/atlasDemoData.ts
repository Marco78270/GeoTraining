import {
  Building2,
  Fence,
  Leaf,
  Milestone,
  Route,
  Signpost,
  UtilityPole,
  type LucideIcon,
} from "lucide-react";

export type Difficulty = "easy" | "medium" | "expert";
export type Continent = "Europe" | "Asie" | "Amériques" | "Océanie" | "Afrique";

export type AtlasCategory = {
  id: string;
  name: string;
  shortName: string;
  total: number;
  countries: number;
  icon: LucideIcon;
};

export type AtlasCountry = {
  code: string;
  name: string;
  continent: Continent;
  coordinates: [number, number];
  difficulty: Difficulty;
  counts: Record<string, number>;
  characteristics: string[];
  notes: string[];
  regions: string[];
  visualTone: string;
};

export const atlasCategories: AtlasCategory[] = [
  {
    id: "stop",
    name: "Panneaux STOP",
    shortName: "STOP",
    total: 248,
    countries: 63,
    icon: Signpost,
  },
  {
    id: "plates",
    name: "Plaques d’immatriculation",
    shortName: "Plaques",
    total: 132,
    countries: 41,
    icon: Milestone,
  },
  {
    id: "markings",
    name: "Marquages routiers",
    shortName: "Marquages",
    total: 96,
    countries: 35,
    icon: Route,
  },
  {
    id: "poles",
    name: "Poteaux électriques",
    shortName: "Poteaux",
    total: 87,
    countries: 29,
    icon: UtilityPole,
  },
  {
    id: "bollards",
    name: "Bollards",
    shortName: "Bollards",
    total: 74,
    countries: 24,
    icon: Fence,
  },
  {
    id: "vegetation",
    name: "Végétation",
    shortName: "Végétation",
    total: 58,
    countries: 21,
    icon: Leaf,
  },
  {
    id: "architecture",
    name: "Architecture",
    shortName: "Architecture",
    total: 115,
    countries: 38,
    icon: Building2,
  },
];

export const atlasCountries: AtlasCountry[] = [
  {
    code: "FR",
    name: "France",
    continent: "Europe",
    coordinates: [2.2, 46.3],
    difficulty: "easy",
    counts: { stop: 42, plates: 27, markings: 18, poles: 12, bollards: 16, vegetation: 8, architecture: 24 },
    characteristics: ["Octogone rouge", "Texte : STOP", "Bordure blanche", "Très commun en Europe"],
    notes: ["Souvent accompagné de marquages au sol", "Comparer avec ARRÊT / ALTO / DUR selon le pays"],
    regions: ["Île-de-France", "Bretagne", "Occitanie", "Auvergne-Rhône-Alpes"],
    visualTone: "village",
  },
  {
    code: "US",
    name: "États-Unis",
    continent: "Amériques",
    coordinates: [-101, 39],
    difficulty: "medium",
    counts: { stop: 51, plates: 31, markings: 23, poles: 20, bollards: 4, vegetation: 9, architecture: 15 },
    characteristics: ["Panneau large", "Texte blanc très épais", "Dos métallique", "Implantation fréquente aux carrefours"],
    notes: ["Observer la largeur des routes", "Les plaques et lignes jaunes complètent l’indice"],
    regions: ["Californie", "Texas", "New York", "Colorado"],
    visualTone: "suburb",
  },
  {
    code: "BR",
    name: "Brésil",
    continent: "Amériques",
    coordinates: [-52, -10],
    difficulty: "easy",
    counts: { stop: 29, plates: 14, markings: 11, poles: 16, bollards: 3, vegetation: 12, architecture: 13 },
    characteristics: ["Texte : PARE", "Rouge vif", "Poteaux souvent fins", "Végétation tropicale fréquente"],
    notes: ["PARE est un indice portugais décisif", "Vérifier le type de chaussée et les poteaux"],
    regions: ["São Paulo", "Minas Gerais", "Paraná", "Bahia"],
    visualTone: "tropical",
  },
  {
    code: "IN",
    name: "Inde",
    continent: "Asie",
    coordinates: [78, 22],
    difficulty: "medium",
    counts: { stop: 22, plates: 18, markings: 9, poles: 15, bollards: 2, vegetation: 7, architecture: 10 },
    characteristics: ["Anglais fréquent", "Signalisation variable", "Poteaux en béton", "Circulation à gauche"],
    notes: ["Regarder le côté de conduite", "Les écritures régionales sont souvent plus utiles que le panneau"],
    regions: ["Delhi", "Maharashtra", "Karnataka", "Tamil Nadu"],
    visualTone: "warm",
  },
  {
    code: "JP",
    name: "Japon",
    continent: "Asie",
    coordinates: [138, 36],
    difficulty: "expert",
    counts: { stop: 18, plates: 12, markings: 14, poles: 10, bollards: 5, vegetation: 6, architecture: 11 },
    characteristics: ["Panneau triangulaire possible", "Texte japonais", "Conduite à gauche", "Signalisation très dense"],
    notes: ["Ne pas chercher uniquement un octogone", "Les poteaux et marquages affinent la région"],
    regions: ["Kantō", "Kansai", "Hokkaidō", "Kyūshū"],
    visualTone: "urban",
  },
  {
    code: "AU",
    name: "Australie",
    continent: "Océanie",
    coordinates: [134, -25],
    difficulty: "easy",
    counts: { stop: 34, plates: 17, markings: 13, poles: 7, bollards: 8, vegetation: 10, architecture: 9 },
    characteristics: ["Anglais", "Conduite à gauche", "Poteau galvanisé", "Environnement souvent très ouvert"],
    notes: ["La végétation et la couleur du sol sont importantes", "Comparer les plaques entre États"],
    regions: ["Nouvelle-Galles du Sud", "Victoria", "Queensland", "Australie-Occidentale"],
    visualTone: "outback",
  },
  {
    code: "ZA",
    name: "Afrique du Sud",
    continent: "Afrique",
    coordinates: [24, -29],
    difficulty: "medium",
    counts: { stop: 26, plates: 9, markings: 8, poles: 11, bollards: 4, vegetation: 7, architecture: 8 },
    characteristics: ["Anglais", "Conduite à gauche", "Routes larges", "Paysages très contrastés"],
    notes: ["Les clôtures et accotements sont utiles", "Attention aux ressemblances avec l’Australie"],
    regions: ["Gauteng", "Cap-Occidental", "KwaZulu-Natal", "Cap-Oriental"],
    visualTone: "cape",
  },
  {
    code: "CA",
    name: "Canada",
    continent: "Amériques",
    coordinates: [-107, 56],
    difficulty: "expert",
    counts: { stop: 26, plates: 4, markings: 0, poles: 6, bollards: 2, vegetation: 4, architecture: 25 },
    characteristics: ["STOP ou ARRÊT", "Signalisation bilingue possible", "Routes très larges", "Poteaux robustes"],
    notes: ["ARRÊT indique fortement le Québec", "La langue et les plaques distinguent les provinces"],
    regions: ["Québec", "Ontario", "Colombie-Britannique", "Alberta"],
    visualTone: "northern",
  },
];

export const difficultyLabels: Record<Difficulty, string> = {
  easy: "Facile",
  medium: "Moyen",
  expert: "Expert",
};
