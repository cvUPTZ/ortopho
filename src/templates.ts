import type {Lang} from './types';

interface BilanTemplateDef {
  testsHeadings: string[];
  conclHeadings: string[];
}

const CONCL_STANDARD_FR = [
  'Conclusion',
  'Projet thérapeutique',
  'Fréquence et durée proposées',
];

const CONCL_STANDARD_AR = [
  'الخلاصة التشخيصية',
  'المشروع العلاجي',
  'وتيرة الحصص والمدة المقترحة',
];

const CONCL_EXERCICES_FR = ['Prochain rendez-vous'];
const CONCL_EXERCICES_AR = ['الموعد القادم'];

const TEMPLATES_FR: Record<string, BilanTemplateDef> = {
  '0': {
    testsHeadings: [
      'Anamnèse et plainte',
      'Langage oral : compréhension',
      'Langage oral : expression (lexique, morphosyntaxe, discours)',
      'Phonologie et articulation',
      'Communication et pragmatique',
      'Langue(s) évaluée(s) et limites de l’évaluation (outils non étalonnés)',
      'Épreuves passées (noms, scores)',
      'Observations cliniques',
    ],
    conclHeadings: CONCL_STANDARD_FR,
  },
  '1': {
    testsHeadings: [
      'Épreuves passées (noms, scores)',
      'Dénombrement et comptage',
      'Numération et système décimal',
      'Calcul et résolution de problèmes',
      'Raisonnement logique et classification',
      'Observations cliniques',
    ],
    conclHeadings: CONCL_STANDARD_FR,
  },
  '2': {
    testsHeadings: [
      'Parole : articulation et intelligibilité',
      'Fluence (bégaiement, débit)',
      'Voix : qualité, hauteur, intensité',
      'Respiration et posture',
      'Praxies bucco-faciales',
      'Épreuves passées (noms, scores)',
      'Observations cliniques',
    ],
    conclHeadings: CONCL_STANDARD_FR,
  },
  '3': {
    testsHeadings: [
      'Lecture : décodage et précision',
      'Lecture : vitesse et compréhension',
      'Écriture et orthographe',
      'Conscience phonologique',
      'Langue(s) évaluée(s) et limites de l’évaluation (outils non étalonnés)',
      'Épreuves passées (noms, scores)',
      'Observations cliniques',
    ],
    conclHeadings: CONCL_STANDARD_FR,
  },
  '4': {
    testsHeadings: [
      'Rappel des objectifs',
      'Progrès observés',
      'Difficultés persistantes',
      'Épreuves repassées (scores comparés)',
      'Observations cliniques',
    ],
    conclHeadings: CONCL_STANDARD_FR,
  },
  '5': {
    testsHeadings: ['Observations cliniques'],
    conclHeadings: CONCL_STANDARD_FR,
  },
  '6': {
    testsHeadings: [
      'Objectif',
      'Exercices',
      'Fréquence et durée',
      'Conseils aux parents',
    ],
    conclHeadings: CONCL_EXERCICES_FR,
  },
  '7': {
    testsHeadings: [
      'Étiologie, date de survenue, imagerie',
      'Langues et niveau d’études avant l’atteinte',
      'Compréhension orale et écrite',
      'Expression orale (fluence, manque du mot, paraphasies)',
      'Répétition, lecture, écriture',
      'Déglutition et parole (dysarthrie, apraxie)',
      'Attention, mémoire, fonctions exécutives',
      'Communication fonctionnelle et rôle de l’entourage',
      'Épreuves passées (noms, scores)',
      'Observations cliniques',
    ],
    conclHeadings: CONCL_STANDARD_FR,
  },
};

const TEMPLATES_AR: Record<string, BilanTemplateDef> = {
  '0': {
    testsHeadings: [
      'القصة المرضية وسبب الاستشارة',
      'اللغة الشفهية: الفهم',
      'اللغة الشفهية: التعبير (المعجم، التركيب الصرفي النحوي، السرد)',
      'الفونولوجيا والنطق',
      'التواصل والبراغماتية',
      'اللغة أو اللغات المقيّمة وحدود التقييم (أدوات غير مقنّنة)',
      'الاختبارات المطبّقة (الأسماء والنتائج)',
      'الملاحظات الإكلينيكية',
    ],
    conclHeadings: CONCL_STANDARD_AR,
  },
  '1': {
    testsHeadings: [
      'الاختبارات المطبّقة (الأسماء والنتائج)',
      'العدّ والإحصاء',
      'الترقيم والنظام العشري',
      'الحساب وحل المشكلات',
      'الاستدلال المنطقي والتصنيف',
      'الملاحظات الإكلينيكية',
    ],
    conclHeadings: CONCL_STANDARD_AR,
  },
  '2': {
    testsHeadings: [
      'الكلام: النطق والوضوح',
      'الطلاقة (التأتأة، سرعة الكلام)',
      'الصوت: النوعية، الطبقة، الشدة',
      'التنفس والوضعية',
      'الحركات الفمية الوجهية (البراكسيا)',
      'الاختبارات المطبّقة (الأسماء والنتائج)',
      'الملاحظات الإكلينيكية',
    ],
    conclHeadings: CONCL_STANDARD_AR,
  },
  '3': {
    testsHeadings: [
      'القراءة: فك الرموز والدقة',
      'القراءة: السرعة والفهم',
      'الكتابة والإملاء',
      'الوعي الصوتي',
      'اللغة أو اللغات المقيّمة وحدود التقييم (أدوات غير مقنّنة)',
      'الاختبارات المطبّقة (الأسماء والنتائج)',
      'الملاحظات الإكلينيكية',
    ],
    conclHeadings: CONCL_STANDARD_AR,
  },
  '4': {
    testsHeadings: [
      'تذكير بالأهداف المسطّرة',
      'التقدم الملاحظ',
      'الصعوبات المستمرة',
      'الاختبارات المعادة (مقارنة النتائج)',
      'الملاحظات الإكلينيكية',
    ],
    conclHeadings: CONCL_STANDARD_AR,
  },
  '5': {
    testsHeadings: ['الملاحظات الإكلينيكية'],
    conclHeadings: CONCL_STANDARD_AR,
  },
  '6': {
    testsHeadings: [
      'الهدف',
      'التمارين المقترحة',
      'التكرار والمدة',
      'نصائح وإرشادات للأولياء',
    ],
    conclHeadings: CONCL_EXERCICES_AR,
  },
  '7': {
    testsHeadings: [
      'السبب وتاريخ الإصابة والتصوير الطبي',
      'اللغات والمستوى الدراسي قبل الإصابة',
      'الفهم الشفهي والكتابي',
      'التعبير الشفهي (الطلاقة، نقص الكلمة، البارافازيا)',
      'التكرار، القراءة، الكتابة',
      'البلع والكلام (عسر التلفظ، أبراكسيا الكلام)',
      'الانتباه، الذاكرة، الوظائف التنفيذية',
      'التواصل الوظيفي ودور المحيط العائلي',
      'الاختبارات المطبّقة (الأسماء والنتائج)',
      'الملاحظات الإكلينيكية',
    ],
    conclHeadings: CONCL_STANDARD_AR,
  },
};

function formatTemplate(headings: string[]): string {
  return headings.map((h) => `■ ${h}\n\n`).join('');
}

export function getBilanTemplates(type: string, lang: Lang): {tests: string; concl: string} {
  const dict = lang === 'ar' ? TEMPLATES_AR : TEMPLATES_FR;
  const def = dict[type] ?? dict['0'];
  return {
    tests: formatTemplate(def.testsHeadings),
    concl: formatTemplate(def.conclHeadings),
  };
}

export function isUntouchedTestsTemplate(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  for (const dict of [TEMPLATES_FR, TEMPLATES_AR]) {
    for (const def of Object.values(dict)) {
      if (formatTemplate(def.testsHeadings).trim() === trimmed) {
        return true;
      }
    }
  }
  return false;
}

export function isUntouchedConclTemplate(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  for (const dict of [TEMPLATES_FR, TEMPLATES_AR]) {
    for (const def of Object.values(dict)) {
      if (formatTemplate(def.conclHeadings).trim() === trimmed) {
        return true;
      }
    }
  }
  return false;
}

export interface ParsedSection {
  heading: string;
  body: string;
}

export function parseTemplateSections(text: string): ParsedSection[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const sections: ParsedSection[] = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('■ ')) {
      if (currentHeading || currentLines.some((l) => l.trim().length > 0)) {
        const body = currentLines.join('\n').trim();
        if (body) {
          sections.push({heading: currentHeading, body});
        }
      }
      currentHeading = line.slice(2).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  const lastBody = currentLines.join('\n').trim();
  if (lastBody) {
    sections.push({heading: currentHeading, body: lastBody});
  }

  return sections;
}
