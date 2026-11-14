import {createDefaultAiSettings, emptyAnamnese, makeId, todayISO} from './storage';
import {getBilanTemplates} from './templates';
import type {Bilan, DB, Lang, Patient, Rdv, Staff} from './types';
import {addDaysISO} from './utils';

function yearsAgoISO(years: number, monthOffset = 0): string {
  const now = new Date();
  const y = now.getFullYear() - years;
  const m = ((now.getMonth() + monthOffset + 12) % 12) + 1;
  const d = Math.min(25, Math.max(1, now.getDate()));
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function generateDemoDB(lang: Lang): DB {
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  const staff: Staff[] = [
    {id: 'st_demo_1', nom: 'Mme Samira Benali', role: 'main'},
    {id: 'st_demo_2', nom: 'M. Karim Haddad', role: 'th'},
  ];

  const patients: Patient[] = [
    {
      id: 'pat_demo_1',
      nom: 'Yacine Brahimi',
      naissance: yearsAgoISO(5, 2),
      tel: '0555 000 001',
      parent: 'Nadia Brahimi',
      medecin: 'Dr. M. Cherif (Pédiatre)',
      patho: '0',
      motif: 'Retard d’apparition des phrases à 5 ans, vocabulaire limité.',
      notes: 'Très coopératif en jeu symbolique. Bonne attention conjointe.',
      stage: 'suivi',
      th: 'st_demo_1',
      an: {
        ...emptyAnamnese(),
        gest: 'Grossesse à terme, accouchement par voie basse, poids 3,4 kg.',
        dev: 'Marche à 14 mois, premiers mots vers 22 mois.',
        lang: 'Arabe algérien à la maison (mère et père), comptines en français. Préscolaire en arabe depuis 6 mois.',
        scol: 'Classe préparatoire, intégration calme, peu de prises de parole en groupe.',
        aud: 'Otites séreuses à 3 ans, bilan ORL normal il y a 4 mois.',
        fam: 'Un cousin paternel a présenté un retard de langage simple. Pas de consanguinité.',
        comp: 'Enfant curieux, joue volontiers aux constructions.',
        att: 'Améliorer l’expression avant l’entrée en première année primaire.',
      },
    },
    {
      id: 'pat_demo_2',
      nom: 'Meriem Khelifi',
      naissance: yearsAgoISO(8, -1),
      tel: '0555 000 002',
      parent: 'Rachid Khelifi',
      medecin: 'Médecine scolaire',
      patho: '3',
      motif: 'Confusions phonémiques persistantes en lecture et dictée (2e AP).',
      notes: 'Lenteur en décodage sur les mots irréguliers.',
      stage: 'suivi',
      th: 'st_demo_1',
      an: {
        ...emptyAnamnese(),
        lang: 'Arabe dialectal et amazigh en famille ; scolarisation en arabe, initiation français.',
        scol: '3e année primaire, difficultés en lecture depuis la 1re AP.',
        fam: 'Le père rapporte des difficultés similaires en lecture durant son enfance.',
        att: 'Gagner en fluence de lecture et en confiance en classe.',
      },
    },
    {
      id: 'pat_demo_3',
      nom: 'Anis Boudiaf',
      naissance: yearsAgoISO(6, 4),
      tel: '0555 000 003',
      parent: 'Fatima Boudiaf',
      medecin: '',
      patho: '2',
      motif: 'Répétitions syllabiques et blocages apparus depuis 8 mois.',
      notes: 'Sensible à la pression temporelle.',
      stage: 'suivi',
      th: 'st_demo_2',
      an: {
        ...emptyAnamnese(),
        dev: 'Développement langagier précoce, phrases complexes à 3 ans.',
        lang: 'Arabe algérien à la maison, français avec la tante.',
        fam: 'Oncle maternel ayant présenté un bégaiement transitoire.',
        comp: 'Perfectionniste, évite parfois de parler devant les inconnus.',
      },
    },
    {
      id: 'pat_demo_4',
      nom: 'Lina Mansouri',
      naissance: yearsAgoISO(4, 1),
      tel: '0555 000 004',
      parent: 'Sofiane Mansouri',
      medecin: 'Dr. K. Amrani',
      patho: '1',
      motif: 'Sigmatisme interdental et simplification des groupes consonantiques.',
      notes: 'Suivi en fin de progression, bonne automatisation en spontané.',
      stage: 'suivi',
      th: 'st_demo_2',
      an: {
        ...emptyAnamnese(),
        aud: 'Audition normale.',
        comp: 'Très expressive et motivée par les jeux de plateau.',
      },
    },
    {
      id: 'pat_demo_5',
      nom: 'Abdelkader Ziani',
      naissance: yearsAgoISO(72, -3),
      tel: '0555 000 005',
      parent: 'Salima Ziani (épouse)',
      medecin: 'Dr. S. Belkacem (Neurologue)',
      patho: '6',
      motif: 'Aphasie non fluente post-AVC ischémique sylvien gauche (il y a 4 mois).',
      notes: 'Manque du mot important, bonne compréhension contextuelle. Accompagné par son épouse.',
      stage: 'suivi',
      th: 'st_demo_1',
      an: {
        ...emptyAnamnese(),
        lang: 'Bilingue arabe (langue maternelle) et français (langue professionnelle, ancien comptable).',
        med: 'HTA traitée, AVC ischémique gauche il y a 4 mois, rééducation motrice en cours.',
        att: 'Retrouver une communication fonctionnelle avec la famille.',
      },
    },
    {
      id: 'pat_demo_6',
      nom: 'Ines Zerrouki',
      naissance: yearsAgoISO(11, 0),
      tel: '0555 000 006',
      parent: 'Leila Zerrouki',
      medecin: 'Dr. H. Toumi (ORL)',
      patho: '5',
      motif: 'Dysphonie chronique sur nodules vocaux bilatéraux.',
      notes: 'Forçage vocal à l’école et lors des activités sportives.',
      stage: 'suivi',
      th: 'st_demo_2',
      an: {
        ...emptyAnamnese(),
        aud: 'Nasofibroscopie ORL : petits nodules en miroir.',
        comp: 'Enfant dynamique, parle fort en milieu bruyant.',
      },
    },
    {
      id: 'pat_demo_7',
      nom: 'Rayan Bouzid',
      naissance: yearsAgoISO(9, 5),
      tel: '0555 000 007',
      parent: 'Mourad Bouzid',
      medecin: '',
      patho: '4',
      motif: 'Difficultés marquées en numération décimale et résolution de problèmes.',
      notes: 'Bilan logico-mathématique à planifier.',
      stage: 'diag',
      th: 'st_demo_1',
      an: {
        ...emptyAnamnese(),
        scol: '4e année primaire, bonne maîtrise de la lecture mais blocage sur les opérations.',
      },
    },
    {
      id: 'pat_demo_8',
      nom: 'Adam Taleb',
      naissance: yearsAgoISO(4, -4),
      tel: '0555 000 008',
      parent: 'Houda Taleb',
      medecin: 'Dr. F. Benmoussa (Pédopsychiatre)',
      patho: '7',
      motif: 'Diagnostic posé, attente d’orientation vers un créneau de suivi bi-hebdomadaire.',
      notes: 'Communication par pointage et quelques syllabes. Bilan initial effectué.',
      stage: 'orient',
      th: '',
      an: {
        ...emptyAnamnese(),
        lang: 'Arabe algérien à la maison, exposition modérée aux écrans réduite depuis 3 mois.',
        comp: 'Réagit à son prénom, intérêt pour les objets rotatifs.',
      },
    },
    {
      id: 'pat_demo_9',
      nom: 'Salma Djebbar',
      naissance: yearsAgoISO(6, -2),
      tel: '0555 000 009',
      parent: 'Nabil Djebbar',
      medecin: '',
      patho: '8',
      motif: 'Demande de bilan reçue par téléphone pour troubles de la déglutition atypique.',
      notes: 'Orientée par son orthodontiste.',
      stage: 'req',
      th: '',
      an: emptyAnamnese(),
    },
    {
      id: 'pat_demo_10',
      nom: 'Mehdi Ouali',
      naissance: yearsAgoISO(7, 3),
      tel: '0555 000 010',
      parent: 'Kamel Ouali',
      medecin: '',
      patho: '1',
      motif: 'Rhotacisme corrigé, sortie de prise en charge.',
      notes: 'Objectifs atteints après 14 séances.',
      stage: 'clos',
      th: 'st_demo_2',
      an: emptyAnamnese(),
    },
  ];

  // Build ~65 unique non-overlapping appointments over -6 weeks .. +3 weeks
  const rdv: Rdv[] = [];
  let rseq = 1;
  const usedSlots = new Set<string>();

  const pushRdv = (item: Omit<Rdv, 'id'>) => {
    const key = `${item.date}|${item.th}|${item.heure}`;
    if (usedSlots.has(key)) return;
    usedSlots.add(key);
    rdv.push({id: makeId('rdv'), ...item});
  };

  // Fixed weekly schedules across 10 weeks (-6 to +3 relative to today)
  // Assign distinct weekday offsets and hours per therapist so no overlap ever happens
  const schedules: {
    pid: string;
    th: string;
    dayOffsetFromToday: number;
    heure: string;
    dur: number;
  }[] = [
    {pid: 'pat_demo_1', th: 'st_demo_1', dayOffsetFromToday: 0, heure: '09:00', dur: 30}, // Today!
    {pid: 'pat_demo_2', th: 'st_demo_1', dayOffsetFromToday: 0, heure: '10:00', dur: 30}, // Today!
    {pid: 'pat_demo_5', th: 'st_demo_1', dayOffsetFromToday: 1, heure: '09:30', dur: 45}, // Tomorrow!
    {pid: 'pat_demo_3', th: 'st_demo_2', dayOffsetFromToday: 0, heure: '11:00', dur: 30}, // Today!
    {pid: 'pat_demo_4', th: 'st_demo_2', dayOffsetFromToday: 1, heure: '10:30', dur: 30}, // Tomorrow!
    {pid: 'pat_demo_6', th: 'st_demo_2', dayOffsetFromToday: 2, heure: '14:00', dur: 30},
    {pid: 'pat_demo_1', th: 'st_demo_1', dayOffsetFromToday: 3, heure: '09:00', dur: 30},
  ];

  let pastCounter = 0;
  // Track pat_demo_2 recent 3 done sessions so she pays half (1000 DA) -> owes 3000 DA total!
  const pat2RecentDone: Rdv[] = [];

  for (let week = -6; week <= 3; week++) {
    for (const sc of schedules) {
      const offset = week * 7 + sc.dayOffsetFromToday;
      const date = addDaysISO(today, offset);
      const isPast = offset < 0;
      let statut: Rdv['statut'] = 'prevu';
      if (isPast) {
        pastCounter++;
        statut = pastCounter % 7 === 0 ? 'absent' : 'fait';
      }

      const tarif = 2000;
      const pay =
        statut === 'fait'
          ? [{d: date, m: tarif}]
          : [];
      const rno =
        statut === 'fait' && pay.length > 0
          ? `R-${date.slice(0, 4)}-${String(rseq++).padStart(4, '0')}`
          : '';

      const note =
        statut === 'fait'
          ? lang === 'ar'
            ? 'حصة منتظمة مع تفاعل جيد وتمارين منزلية مقترحة.'
            : 'Séance productive, bonne participation. Exercices de consolidation donnés.'
          : statut === 'absent'
            ? lang === 'ar'
              ? 'غائب بعذر.'
              : 'Absence signalée par la famille.'
            : '';

      const item: Rdv = {
        id: makeId('rdv'),
        pid: sc.pid,
        date,
        heure: sc.heure,
        statut,
        tarif,
        pay,
        note,
        rno,
        kind: 'suivi',
        th: sc.th,
        dur: sc.dur,
        rem: '',
      };

      const key = `${item.date}|${item.th}|${item.heure}`;
      if (!usedSlots.has(key)) {
        usedSlots.add(key);
        rdv.push(item);
        if (sc.pid === 'pat_demo_2' && statut === 'fait') {
          pat2RecentDone.push(item);
        }
      }
    }
  }

  // Make pat_demo_2 pay only 1000 DA on her last 3 done sessions -> 3000 DA owed total
  const lastThreePat2 = pat2RecentDone.slice(-3);
  for (const r of lastThreePat2) {
    r.pay = [{d: r.date, m: 1000}];
  }

  // One diagnostic planned (for pat_demo_7 tomorrow)
  pushRdv({
    pid: 'pat_demo_7',
    date: tomorrow,
    heure: '14:00',
    statut: 'prevu',
    tarif: 2500,
    pay: [],
    note: '',
    rno: '',
    kind: 'diag',
    th: 'st_demo_1',
    dur: 60,
    rem: '',
  });

  // One diagnostic done (for pat_demo_8 4 days ago)
  const diagDoneDate = addDaysISO(today, -4);
  pushRdv({
    pid: 'pat_demo_8',
    date: diagDoneDate,
    heure: '15:00',
    statut: 'fait',
    tarif: 2500,
    pay: [{d: diagDoneDate, m: 2500}],
    note: 'Bilan initial réalisé, orientation vers suivi hebdomadaire validée.',
    rno: `R-${diagDoneDate.slice(0, 4)}-${String(rseq++).padStart(4, '0')}`,
    kind: 'diag',
    th: 'st_demo_1',
    dur: 60,
    rem: '',
  });

  // 4 filled assessments using template headings (oral language 0, reading/writing 3, voice 2, adult neuro 7)
  const makeFilledBilan = (
    pid: string,
    date: string,
    type: string,
    snippets: string[],
    conclText: string,
  ): Bilan => {
    const tpl = getBilanTemplates(type, lang);
    const sections = tpl.tests.split('■ ').filter(Boolean);
    const filledTests = sections
      .map((sec, idx) => {
        const heading = sec.trim();
        const body = snippets[idx] ?? '';
        return `■ ${heading}\n${body}\n`;
      })
      .join('\n');

    const conclSections = tpl.concl.split('■ ').filter(Boolean);
    const filledConcl = conclSections
      .map((sec, idx) => {
        const heading = sec.trim();
        const body = idx === 0 ? conclText : idx === 1 ? (lang === 'ar' ? 'خطة علاجية فردية أسبوعية.' : 'Prise en charge orthophonique hebdomadaire ciblée.') : (lang === 'ar' ? 'حصتان أسبوعياً (30 دقيقة).' : '1 à 2 séances par semaine de 30 minutes.');
        return `■ ${heading}\n${body}\n`;
      })
      .join('\n');

    return {
      id: makeId('bil'),
      pid,
      date,
      type,
      tests: filledTests.trim(),
      concl: filledConcl.trim(),
    };
  };

  const bilans: Bilan[] = [
    makeFilledBilan(
      'pat_demo_1',
      addDaysISO(today, -35),
      '0',
      [
        'Retard d’expression signalé par les parents à 5 ans.',
        'Compréhension lexicale et syntaxique fonctionnelle sur consignes simples et doubles.',
        'Phrases de 2 à 3 mots, omissions de mots-outils.',
        'Simplification des clusters consonantiques, phonèmes isolés acquis.',
        'Bon contact visuel, tour de rôle respecté.',
        'Évaluation conduite en arabe algérien (langue maternelle) avec appui qualitatif en français. Absence d’étalonnage local standardisé ; résultats interprétés cliniquement.',
        'Dénomination imagée (32/45), répétition de phrases simples.',
        'Enfant attentif et coopérant.',
      ],
      'Retard simple du langage expressif avec bonne compréhension préservée.',
    ),
    makeFilledBilan(
      'pat_demo_2',
      addDaysISO(today, -28),
      '3',
      [
        'Décodage hésitant sur les graphèmes proches (ب/ت/ث, d/b).',
        'Vitesse de lecture de 28 mots/min, compréhension préservée à l’oral.',
        'Erreurs phonologiques en dictée de logatomes et mots réguliers.',
        'Difficultés de fusion et de segmentation syllabique complexe.',
        'Évaluation en arabe littéraire scolaire. Outils cliniques non étalonnés, analyse qualitative des erreurs.',
        'Lecture de texte gradué, dictée de syllabes.',
        'Fatigabilité en fin d’épreuve.',
      ],
      'Troubles spécifiques d’acquisition du langage écrit à dominante phonologique.',
    ),
    makeFilledBilan(
      'pat_demo_6',
      addDaysISO(today, -20),
      '2',
      [
        'Articulation précise, bonne intelligibilité.',
        'Débit rapide avec reprises inspiratoires audibles.',
        'Voix voilée, raucité modérée, fatigue vocale en fin de journée.',
        'Respiration thoracique haute, tension cervicale.',
        'Praxies conservées.',
        'Mesure du temps maximal de phonation (TMP : 7 s).',
        'Motivé pour les exercices de souffle.',
      ],
      'Dysphonie dysfonctionnelle sur forçage vocal chronique.',
    ),
    makeFilledBilan(
      'pat_demo_5',
      addDaysISO(today, -15),
      '7',
      [
        'AVC ischémique sylvien gauche (IRM du mois dernier).',
        'Bilingue arabe/français, niveau universitaire.',
        'Compréhension orale conservée sur énoncés complexes ; lecture de mots isolés préservée.',
        'Manque du mot fréquent, fluence réduite, ébauches orales efficaces.',
        'Répétition de mots courts réussie, difficulté sur phrases longues.',
        'Absence de troubles de déglutition signalés.',
        'Attention soutenue bonne, légère lenteur exécutive.',
        'Épouse très impliquée et aidante au quotidien.',
        'Épreuve de dénomination bilingue adaptée, fluence catégorielle.',
        'Excellente motivation pour la rééducation.',
      ],
      'Aphasie motrice à prédominance d’anomie en phase de récupération.',
    ),
  ];

  return {
    lang,
    tarif: 2000,
    patients,
    rdv,
    bilans,
    cab: {
      nom: 'Cabinet d’orthophonie (démo)',
      pra: 'Mme Samira Benali',
      addr: '14 Rue Didouche Mourad, Alger',
      tel: '021 00 00 00',
      legal: 'NIF 000000000000000 · Agrément DSP n° 00/0000',
      color: '#2b4c9b',
      logo: '',
      h1: '08:00',
      h2: '17:00',
      dur: '30',
      wamsg: '',
    },
    staff,
    rseq,
    lastBackup: Date.now(),
    ai: createDefaultAiSettings(),
    aiLog: [],
    aiSheets: [],
  };
}
