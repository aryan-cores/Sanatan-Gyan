// Devanagari → IAST transliteration engine.
// Converts any Sanskrit shlok automatically — no manual transliteration needed per verse.

const DEVA_VOWELS_INDEP = {
  'अ':'a','आ':'ā','इ':'i','ई':'ī','उ':'u','ऊ':'ū',
  'ऋ':'ṛ','ॠ':'ṝ','ऌ':'ḷ','ॡ':'ḹ',
  'ए':'e','ऐ':'ai','ओ':'o','औ':'au'
};
const DEVA_MATRAS = {
  'ा':'ā','ि':'i','ी':'ī','ु':'u','ू':'ū',
  'ृ':'ṛ','ॄ':'ṝ','ॢ':'ḷ','ॣ':'ḹ',
  'े':'e','ै':'ai','ो':'o','ौ':'au'
};
const DEVA_CONSONANTS = {
  'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ṅ',
  'च':'c','छ':'ch','ज':'j','झ':'jh','ञ':'ñ',
  'ट':'ṭ','ठ':'ṭh','ड':'ḍ','ढ':'ḍh','ण':'ṇ',
  'त':'t','थ':'th','द':'d','ध':'dh','न':'n',
  'प':'p','फ':'ph','ब':'b','भ':'bh','म':'m',
  'य':'y','र':'r','ल':'l','व':'v',
  'श':'ś','ष':'ṣ','स':'s','ह':'h',
  'ळ':'ḷ','क्ष':'kṣ','ज्ञ':'jñ'
};
const DEVA_SIGNS = {
  'ं':'ṃ','ः':'ḥ','ँ':'m̐','ऽ':'\'','ॐ':'oṃ'
};

function transliterateDevanagari(text){
  if(!text) return '';
  let out = '';
  const n = text.length;
  let i = 0;
  while(i < n){
    // handle 2-char conjuncts क्ष / ज्ञ before virama-splitting logic (rare, best-effort skip)
    const c = text[i];

    if(DEVA_CONSONANTS[c]){
      const cons = DEVA_CONSONANTS[c];
      const next = text[i+1];
      if(next === '्'){ // virama: consonant with no vowel
        out += cons;
        i += 2;
        continue;
      } else if(next && DEVA_MATRAS[next]){
        out += cons + DEVA_MATRAS[next];
        i += 2;
        continue;
      } else {
        out += cons + 'a';
        i += 1;
        continue;
      }
    } else if(DEVA_VOWELS_INDEP[c]){
      out += DEVA_VOWELS_INDEP[c];
      i += 1;
    } else if(DEVA_SIGNS[c]){
      out += DEVA_SIGNS[c];
      i += 1;
    } else if(c === '।'){
      out += ' |';
      i += 1;
    } else if(c === '॥'){
      out += ' ||';
      i += 1;
    } else if(/[०-९]/.test(c)){
      out += '0123456789'['०१२३४५६७८९'.indexOf(c)];
      i += 1;
    } else {
      out += c; // space, punctuation, latin chars, digits
      i += 1;
    }
  }
  return out.replace(/\s+/g,' ').trim();
}

// ---------- Devanagari → Gujarati script (direct character mapping — same Brahmic structure) ----------
const DEVA_TO_GUJARATI = {
  'अ':'અ','आ':'આ','इ':'ઇ','ई':'ઈ','उ':'ઉ','ऊ':'ઊ','ऋ':'ઋ','ॠ':'ૠ','ऌ':'ઌ',
  'ए':'એ','ऐ':'ઐ','ओ':'ઓ','औ':'ઔ',
  'ा':'ા','ि':'િ','ी':'ી','ु':'ુ','ू':'ૂ','ृ':'ૃ','ॄ':'ૄ',
  'े':'ે','ै':'ૈ','ो':'ો','ौ':'ૌ',
  'क':'ક','ख':'ખ','ग':'ગ','घ':'ઘ','ङ':'ઙ',
  'च':'ચ','छ':'છ','ज':'જ','झ':'ઝ','ञ':'ઞ',
  'ट':'ટ','ठ':'ઠ','ड':'ડ','ढ':'ઢ','ण':'ણ',
  'त':'ત','थ':'થ','द':'દ','ध':'ધ','न':'ન',
  'प':'પ','फ':'ફ','ब':'બ','भ':'ભ','म':'મ',
  'य':'ય','र':'ર','ल':'લ','व':'વ',
  'श':'શ','ष':'ષ','स':'સ','ह':'હ','ळ':'ળ',
  '्':'્','ं':'ં','ः':'ઃ','ँ':'ઁ','ऽ':'ઽ','ॐ':'ૐ',
  '।':'।','॥':'॥',
  '०':'૦','१':'૧','२':'૨','३':'૩','४':'૪','५':'૫','६':'૬','७':'૭','८':'૮','९':'૯'
};
function devanagariToGujarati(text){
  if(!text) return '';
  let out = '';
  for(const ch of text){
    out += DEVA_TO_GUJARATI[ch] !== undefined ? DEVA_TO_GUJARATI[ch] : ch;
  }
  return out;
}

// Returns the "reading line" shown under the Sanskrit shlok, matched to the selected UI language.
// Hindi / Marathi / Sanskrit all natively use Devanagari, so no separate reading line is needed there.
function getReadingLine(sanskritText, lang){
  if(lang === 'en') return transliterateDevanagari(sanskritText);
  if(lang === 'gu') return devanagariToGujarati(sanskritText);
  return null;
}
