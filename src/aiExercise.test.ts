import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExercisePayload,
  exerciseSheetToBilanText,
  prefillFromPatient,
  validateExerciseSheet,
  validatePrivacyText,
} from './aiExercise.ts';
import {createEmptyDB, emptyAnamnese, sanitize, stripSensitiveForBackup} from './storage.ts';
import type {ExerciseSheet, Patient} from './types.ts';

test('privacy guard rejects names, digits, emails, and URLs while allowing safe clinical notes', () => {
  assert.equal(validatePrivacyText('football'), true);
  assert.equal(validatePrivacyText('voitures et animaux'), true);
  assert.equal(validatePrivacyText('éviter les mots avec /r/ au début'), true);
  assert.equal(validatePrivacyText('كرة القدم والحيوانات'), true);

  // Names (two consecutive capitalized words)
  assert.equal(validatePrivacyText('Ahmed Benali'), false);
  assert.equal(validatePrivacyText('pour Yacine Brahimi'), false);
  assert.equal(validatePrivacyText('Émile Zola'), false);

  // Digits (phones, dates, ages)
  assert.equal(validatePrivacyText('0555123456'), false);
  assert.equal(validatePrivacyText('enfant de 6 ans'), false);
  assert.equal(validatePrivacyText('né en 2020'), false);

  // Emails and URLs
  assert.equal(validatePrivacyText('parent@example.com'), false);
  assert.equal(validatePrivacyText('https://cabinet.dz/fiche'), false);
  assert.equal(validatePrivacyText('www.orthophonie.fr'), false);
});

test('payload construction and phone/name leakage regression from fully populated patient', () => {
  const fullPatient: Patient = {
    id: 'pat_secret_id_999',
    nom: 'Meriem Khelifi',
    naissance: '2018-04-12',
    tel: '0555 98 76 54',
    parent: 'Rachid Khelifi',
    medecin: 'Dr. Amrani',
    patho: '1', // articulation
    motif: 'Sigmatisme interdental observé à la maison avec Rachid',
    notes: 'Note confidentielle Meriem Khelifi 0555 98 76 54',
    stage: 'suivi',
    th: 'st_1',
    an: {
      ...emptyAnamnese(),
      gest: 'Grossesse normale à Alger',
      lang: 'Arabe et français',
      fam: 'Cousin Karim',
    },
  };

  const prefill = prefillFromPatient(fullPatient);
  assert.equal(prefill.category, 'articulation');
  // Must be an age band, never exact age or birth date
  assert.ok(['3-4', '5-6', '7-8', '9-11', '12-15', 'adult'].includes(prefill.ageBand));

  const payload = buildExercisePayload({
    ageBand: prefill.ageBand,
    category: prefill.category,
    target: {sounds: ['/ʃ/'], position: 'initial'},
    outputLanguage: 'fr',
    difficulty: 2,
    length: 'short',
    minutesPerDay: 10,
    daysPerWeek: 5,
    interests: 'Meriem Khelifi 0555 98 76 54', // must be stripped by guard!
    specialNote: 'éviter les mots avec /r/ au début',
  });

  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes('Meriem'), false);
  assert.equal(serialized.includes('Khelifi'), false);
  assert.equal(serialized.includes('Rachid'), false);
  assert.equal(serialized.includes('Amrani'), false);
  assert.equal(serialized.includes('0555'), false);
  assert.equal(serialized.includes('98 76 54'), false);
  assert.equal(serialized.includes('2018-04-12'), false);
  assert.equal(serialized.includes('pat_secret_id_999'), false);
  assert.equal(serialized.includes('Sigmatisme'), false);
  assert.equal(serialized.includes('Alger'), false);
  assert.equal(payload.interests, undefined);
  assert.equal(payload.specialNote, 'éviter les mots avec /r/ au début');
});

test('schema validation of ExerciseSheet response', () => {
  const validRaw = {
    title: 'Son /ʃ/ en début de mot',
    objective: 'Automatiser la production du son /ʃ/ en position initiale.',
    parentTips: ['Restez positif', 'Faites 10 minutes par jour'],
    activities: [
      {
        name: 'Chasse aux mots',
        type: 'wordList',
        instructions: 'Répétez chaque mot lentement.',
        items: [
          {text: 'chat', target: '[ch]at', translation: 'قط'},
          {text: 'chaussure', target: '[ch]aussure'},
        ],
      },
    ],
    routine: {minutesPerDay: 10, daysPerWeek: 5},
    progressGrid: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    closingNote: 'Votre orthophoniste adaptera cette fiche lors de la prochaine séance.',
  };

  const parsed = validateExerciseSheet(validRaw);
  assert.ok(parsed);
  assert.equal(parsed.activities.length, 1);
  assert.equal(parsed.activities[0].type, 'wordList');
  assert.equal(parsed.activities[0].items.length, 2);

  // Invalid / malformed payloads
  assert.equal(validateExerciseSheet(null), null);
  assert.equal(validateExerciseSheet({title: 'Missing activities'}), null);
  assert.equal(validateExerciseSheet({...validRaw, activities: []}), null);
});

test('conversion of ExerciseSheet to Bilan type-6 text uses ■ headings', () => {
  const sheet: ExerciseSheet = {
    title: 'Fiche /ʃ/ initial',
    objective: 'Travailler le son /ʃ/.',
    parentTips: ['Encourager sans corriger brutalement'],
    activities: [
      {
        name: 'Mots cibles',
        type: 'wordList',
        instructions: 'Lire et répéter.',
        items: [{text: 'chat', target: '[ch]at'}],
      },
    ],
    routine: {minutesPerDay: 10, daysPerWeek: 5},
    progressGrid: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
    closingNote: 'Adapté par votre orthophoniste.',
  };

  const frBilan = exerciseSheetToBilanText(sheet, 'fr');
  assert.ok(frBilan.tests.includes('■ Objectif'));
  assert.ok(frBilan.tests.includes('■ Exercices'));
  assert.ok(frBilan.tests.includes('■ Fréquence et durée'));
  assert.ok(frBilan.tests.includes('■ Conseils aux parents'));
  assert.ok(frBilan.concl.includes('■ Prochain rendez-vous'));

  const arBilan = exerciseSheetToBilanText(sheet, 'ar');
  assert.ok(arBilan.tests.includes('■ الهدف'));
  assert.ok(arBilan.tests.includes('■ التمارين المقترحة'));
  assert.ok(arBilan.tests.includes('■ التكرار والمدة'));
  assert.ok(arBilan.tests.includes('■ نصائح وإرشادات للأولياء'));
  assert.ok(arBilan.concl.includes('■ الموعد القادم'));
});

test('sanitize drops legacy apiKey and backups strip send log', () => {
  const rawWithLegacyKey = {
    ...createEmptyDB('fr'),
    ai: {
      enabled: true,
      apiKey: 'AIzaSySecretTestKey123456',
      model: 'gemini-2.5-flash',
    },
    aiLog: [
      {
        id: 'log_1',
        ts: Date.now(),
        model: 'gemini-2.5-flash',
        params: buildExercisePayload({
          ageBand: '5-6',
          category: 'articulation',
          target: {sounds: ['/ʃ/'], position: 'initial'},
          outputLanguage: 'fr',
          difficulty: 2,
          length: 'short',
          minutesPerDay: 10,
          daysPerWeek: 5,
        }),
      },
    ],
  };

  const clean = sanitize(rawWithLegacyKey, 'fr');
  assert.equal(JSON.stringify(clean).includes('AIzaSySecretTestKey123456'), false);
  assert.equal('apiKey' in clean.ai, false);

  const exported = stripSensitiveForBackup(clean);
  assert.equal(exported.aiLog.length, 0);
});
