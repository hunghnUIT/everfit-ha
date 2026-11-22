// Changing an expected value needs a migration of stored keys (§10.1).
//
// Each pair pins one step of the rule: NFKC, then trim, then collapse every
// run of whitespace to one space, then lower-case. Every non-ASCII character
// in an input or an expected value is a brace escape (\u{...}), so that an
// editor cannot turn an invisible, combining or look-alike character into its
// plain form without the change showing; the comment above each pair gives
// the visible form or names the code point. Only comments and test titles
// hold raw non-ASCII text.
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
    // NFKC: "Dumbbell ﬂy", the ligature ﬂ (U+FB02) becomes "fl"
    ['Dumbbell \u{FB02}y', 'dumbbell fly'],
    // NFKC: "ﬁre Hydrant", the ligature ﬁ (U+FB01) becomes "fi"
    ['\u{FB01}re Hydrant', 'fire hydrant'],
    // NFKC: full-width letters "Ｂｅｎｃｈ" become ASCII
    ['\u{FF22}\u{FF45}\u{FF4E}\u{FF43}\u{FF48}', 'bench'],
    // NFKC: full-width "Ｒｏｗ２" becomes ASCII
    ['\u{FF32}\u{FF4F}\u{FF57}\u{FF12}', 'row2'],
    // NFKC: "Cable Fly Ⅱ", the Roman numeral Ⅱ (U+2161) becomes "II", then "ii"
    ['Cable Fly \u{2161}', 'cable fly ii'],
    // NFKC: half-width katakana "ｽｸﾜｯﾄ" become full-width "スクワット"
    [
      '\u{FF7D}\u{FF78}\u{FF9C}\u{FF6F}\u{FF84}',
      '\u{30B9}\u{30AF}\u{30EF}\u{30C3}\u{30C8}',
    ],
    // accents are kept: "Développé couché" with precomposed é (U+00E9)
    [
      'D\u{00E9}velopp\u{00E9} couch\u{00E9}',
      'd\u{00E9}velopp\u{00E9} couch\u{00E9}',
    ],
    // NFKC: e + combining acute (U+0301) composes to é (U+00E9)
    ['De\u{0301}veloppe\u{0301}', 'd\u{00E9}velopp\u{00E9}'],
    // trim: a trailing tab
    ['Leg Press\t', 'leg press'],
    // trim: a leading byte-order mark (U+FEFF), pasted from a document
    ['\u{FEFF}Bench Press', 'bench press'],
    // trim: ideographic spaces (U+3000) on both sides
    ['\u{3000}Squat\u{3000}', 'squat'],
    // NFKC: a non-breaking space (U+00A0) becomes a space
    ['Push\u{00A0}Up', 'push up'],
    // collapse: an em space (U+2003) inside the name
    ['Ab\u{2003}Wheel', 'ab wheel'],
    // collapse: two newlines inside the name
    ['Front\n\nSquat', 'front squat'],
    // punctuation and digits are kept
    ['90/90 Hip Stretch', '90/90 hip stretch'],
    // lower-case outside Latin: Cyrillic "ОТЖИМАНИЯ" becomes "отжимания"
    [
      '\u{041E}\u{0422}\u{0416}\u{0418}\u{041C}\u{0410}\u{041D}\u{0418}\u{042F}',
      '\u{043E}\u{0442}\u{0436}\u{0438}\u{043C}\u{0430}\u{043D}\u{0438}\u{044F}',
    ],
    // lower-case in context: Greek "ΚΑΜΨΕΙΣ" becomes "καμψεις", the capital
    // sigma at the end becoming final ς (U+03C2)
    [
      '\u{039A}\u{0391}\u{039C}\u{03A8}\u{0395}\u{0399}\u{03A3}',
      '\u{03BA}\u{03B1}\u{03BC}\u{03C8}\u{03B5}\u{03B9}\u{03C2}',
    ],
    // lower-case lengthens: "İncline Press", İ (U+0130) becomes
    // i + combining dot above (U+0307)
    ['\u{0130}ncline Press', 'i\u{0307}ncline press'],
    // characters with no case are unchanged: "深蹲"
    ['\u{6DF1}\u{8E72}', '\u{6DF1}\u{8E72}'],
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
    // NFKC: full-width "Ｂａｃｋ" becomes ASCII
    ['\u{FF22}\u{FF41}\u{FF43}\u{FF4B}', 'back'],
    // NFKC: a non-breaking space (U+00A0) becomes a space
    ['Upper\u{00A0}Back', 'upper back'],
    // NFKC: i + combining acute (U+0301) composes to í (U+00ED), "quadríceps"
    ['Quadri\u{0301}ceps', 'quadr\u{00ED}ceps'],
    // lower-case outside Latin: Cyrillic "ГРУДЬ" becomes "грудь"
    [
      '\u{0413}\u{0420}\u{0423}\u{0414}\u{042C}',
      '\u{0433}\u{0440}\u{0443}\u{0434}\u{044C}',
    ],
    // lower-case lengthens: "İliopsoas", İ (U+0130) becomes
    // i + combining dot above (U+0307)
    ['\u{0130}liopsoas', 'i\u{0307}liopsoas'],
  ])('%j → %j', (name, group) => expect(muscleGroupName(name)).toBe(group));
});

describe('helpers', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(codePointLength('bench')).toBe(5);
    expect(codePointLength('\u{1F4AA}')).toBe(1); // 💪, two UTF-16 units
    expect(codePointLength('i\u{0307}')).toBe(2); // i + combining dot above
    expect(codePointLength('')).toBe(0);
  });

  it('collapses every run of whitespace to one space and trims nothing', () =>
    expect(collapseWhitespace(' a \t\n b  c ')).toBe(' a b c '));
});
