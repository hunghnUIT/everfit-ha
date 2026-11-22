// Changing an expected value needs a migration of stored keys (§10.1).
//
// Each pair pins one step of the rule: NFKC, then trim, then collapse every
// run of whitespace to one space, then lower-case. Invisible or confusable
// characters are written as escapes, with the visible form in the comment.
import {
  codePointLength,
  collapseWhitespace,
  exerciseKey,
  muscleGroupName,
} from './exercise-key';

describe('exerciseKey golden pairs', () => {
  it.each([
    // trim, collapse and lower-case together
    ['  ZERCHER   squat ', 'zercher squat'],
    // lower-case only
    ['Bench Press', 'bench press'],
    // an already normalised key is unchanged
    ['bench press', 'bench press'],
    // NFKC: the ligature ﬂ (U+FB02) becomes "fl"
    ['Dumbbell ﬂy', 'dumbbell fly'],
    // NFKC: the ligature ﬁ (U+FB01) becomes "fi"
    ['ﬁre Hydrant', 'fire hydrant'],
    // NFKC: full-width letters (Ｂｅｎｃｈ) become ASCII
    ['Ｂｅｎｃｈ', 'bench'],
    // NFKC: full-width digits (Ｒｏｗ２) become ASCII
    ['Ｒｏｗ２', 'row2'],
    // NFKC: the Roman numeral Ⅱ (U+2161) becomes "II", then "ii"
    ['Cable Fly Ⅱ', 'cable fly ii'],
    // NFKC: half-width katakana (ｽｸﾜｯﾄ) become full-width
    ['ｽｸﾜｯﾄ', 'スクワット'],
    // accents are kept (precomposed é, U+00E9)
    ['Développé couché', 'développé couché'],
    // NFKC: e + combining acute (U+0301) composes to é (U+00E9)
    ['Développé', 'développé'],
    // trim: a trailing tab
    ['Leg Press\t', 'leg press'],
    // trim: a leading byte-order mark (U+FEFF), pasted from a document
    ['﻿Bench Press', 'bench press'],
    // trim: ideographic spaces (U+3000) on both sides
    ['　Squat　', 'squat'],
    // NFKC: a non-breaking space (U+00A0) becomes a space
    ['Push Up', 'push up'],
    // collapse: an em space (U+2003) inside the name
    ['Ab Wheel', 'ab wheel'],
    // collapse: two newlines inside the name
    ['Front\n\nSquat', 'front squat'],
    // punctuation and digits are kept
    ['90/90 Hip Stretch', '90/90 hip stretch'],
    // lower-case outside Latin: Cyrillic
    ['ОТЖИМАНИЯ', 'отжимания'],
    // lower-case in context: Greek capital sigma at the end becomes final ς (U+03C2)
    ['ΚΑΜΨΕΙΣ', 'καμψεις'],
    // lower-case lengthens: İ (U+0130) becomes i + combining dot (U+0307)
    ['İncline Press', 'i̇ncline press'],
    // characters with no case are unchanged (深蹲)
    ['深蹲', '深蹲'],
  ])('%j → %j', (name, key) => expect(exerciseKey(name)).toBe(key));
});

describe('muscleGroupName golden pairs', () => {
  it.each([
    // lower-case only
    ['Chest', 'chest'],
    // trim: a trailing space, so ["Chest", "chest "] is one group
    ['chest ', 'chest'],
    // trim: a tab and a newline
    ['\tGlutes\n', 'glutes'],
    // collapse: two spaces inside the name
    ['Rear  Delts', 'rear delts'],
    // hyphens and digits are kept
    ['Rear-Delts 2', 'rear-delts 2'],
    // NFKC: full-width letters (Ｂａｃｋ) become ASCII
    ['Ｂａｃｋ', 'back'],
    // NFKC: a non-breaking space (U+00A0) becomes a space
    ['Upper Back', 'upper back'],
    // NFKC: i + combining acute (U+0301) composes to í (U+00ED)
    ['Quadríceps', 'quadríceps'],
    // lower-case outside Latin: Cyrillic (ГРУДЬ)
    ['ГРУДЬ', 'грудь'],
    // lower-case lengthens: İ (U+0130) becomes i + combining dot (U+0307)
    ['İliopsoas', 'i̇liopsoas'],
  ])('%j → %j', (name, group) => expect(muscleGroupName(name)).toBe(group));
});

describe('helpers', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(codePointLength('bench')).toBe(5);
    expect(codePointLength('\u{1F4AA}')).toBe(1); // 💪, two UTF-16 units
    expect(codePointLength('i̇')).toBe(2);
    expect(codePointLength('')).toBe(0);
  });

  it('collapses every run of whitespace to one space and trims nothing', () =>
    expect(collapseWhitespace(' a \t\n b  c ')).toBe(' a b c '));
});
