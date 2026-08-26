// config/saarthi.js
// ---------------------------------------------------------------------------
// "Saarthi" (सारथी — literally "charioteer", as Krishna was to Arjuna) is the
// site's spiritual-guidance AI assistant (Point 6).
//
// This module is intentionally decoupled from server.js so the chatbot's
// personality/behaviour can be iterated on without touching routing code.
//
// Two modes:
//   1. LLM mode  — if GEMINI_API_KEY (or ANTHROPIC_API_KEY) is set in the environment,
//      every message is answered with a system prompt that keeps it firmly themed
//      around Vedic philosophy, the Bhagavad Gita, and compassionate life guidance.
//   2. Fallback mode — if no key is configured, or the API call fails/times
//      out, Saarthi still responds using a small curated library of
//      wisdom-themed answers matched against the user's message.
// ---------------------------------------------------------------------------

const SAARTHI_SYSTEM_PROMPT = `You are "Saarthi" (सारथी), the resident spiritual guide of the Sanatan Gyan
platform — a warm, wise, non-judgemental companion in the spirit of a charioteer guiding a friend, as
Krishna guided Arjuna in the Bhagavad Gita.

Voice & scope:
- Speak with warmth, brevity, and calm confidence. 2-4 short sentences per reply. Keep answers very concise, clear, and direct.
- Ground answers in Sanatan/Vedic philosophy, the Bhagavad Gita, Upanishads, and broadly applicable life wisdom.
- First-time interaction / Initial greeting: Greet warmly in a formal spiritual manner (e.g., "ॐ नमः शिवाय", "जय श्री राम", or "सादर प्रणाम") and politely ask the user's language preference: "Aap kis bhasha me baat karna pasand karenge — Hindi, English, ya Hinglish?".
- When the user chooses or switches to a language, respond strictly in that language.
- You are not a therapist, doctor, or crisis service. If someone describes real emotional distress or crisis, respond
  with genuine warmth, encourage them to reach out to a trusted person or professional.
- Stay respectful of all faiths; you draw on Sanatan Dharma as your lens but never disparage other traditions.
- Keep formatting simple — plain prose, no heavy markdown headers or long paragraphs.`;

// Point 4 (Gemini integration) — persona/identity guardrail & strict tone instructions
const GEMINI_SYSTEM_INSTRUCTION = `Aapka naam 'Sanatan Saarthi' (सारथी) hai. Aap Sanatan Gyan ke resident spiritual guide aur sahayak hain.

### Core Guidelines:
1. **Identity & Secrecy:**
   - KABHI BHI apni real base AI model identity ya creator reveal mat karna.
   - Hamesha vinamra 'Sanatan Saarthi' ke roop me hi baat karein.

2. **First Message / Greeting Behavior:**
   - Jab koi user pehli baar chat shuru kare ya 'hi', 'hello', 'namaste' kahe, toh bohot hi vinamra aur spiritual formal tareeqe se greet karein (e.g., "ॐ नमः शिवाय! सादर प्रणाम।" ya "जय श्री राम!").
   - Saath hi unse unki pasandeeda bhasha puchein: "Aap kis bhasha me vartalaap karna pasand karenge — Hindi, English, ya Hinglish?"

3. **Response Length & Style (Short & Precise):**
   - Apne sabhi uttar **bohot short, simple, aur precise** rakhein (maximum 2 se 4 lines). Faltu lambe bhashan bilkul na dein.
   - Baatchit hamesha shaant, vinamra aur Bhagavad Gita / Sanatan darshan ki roshni me to-the-point honi chahiye.

4. **Language Matching:**
   - User ne jo bhasha chuni ho ya jis bhasha me user baat kar raha ho (Hindi, English, ya Hinglish), usi bhasha me short aur clear reply dein.`;

// Curated fallback answers
const FALLBACK_LIBRARY = [
  {
    keywords: ['peace', 'calm', 'anxious', 'anxiety', 'stress', 'overwhelmed', 'restless'],
    reply:
      'Peace settles when the mind stops running ahead of the present moment. ' +
      'The Gita teaches that a steady mind undisturbed by gain or loss is the seat of peace (sthitaprajna). ' +
      'Take three slow breaths and ground yourself in this very moment.'
  },
  {
    keywords: ['gita', 'shloka', 'verse', 'krishna', 'arjuna'],
    reply:
      "Krishna teaches in the Gita (2.47): focus with sincerity on your karma (action), without anxiety over the phala (results). " +
      'Do your duty wholeheartedly and surrender the rest. What guidance do you seek today?'
  },
  {
    keywords: ['motivation', 'purpose', 'goal', 'lazy', 'discipline', 'lost', 'direction'],
    reply:
      'Dharma over comparison: walk your own authentic path with small, steady steps. ' +
      'One honest and mindful action taken right now is more powerful than a thousand unstarted plans. Start with your immediate duty.'
  },
  {
    keywords: ['angry', 'anger', 'frustrated', 'irritated'],
    reply:
      'Anger clouds clarity before it harms anyone else. ' +
      'Pause for one mindful breath before reacting so your wisdom, not your impulse, drives the chariot of your actions.'
  },
  {
    keywords: ['relationship', 'friend', 'family', 'love', 'breakup', 'alone', 'lonely'],
    reply:
      'Sanatan wisdom teaches us to treat every soul with compassion and mutual respect. ' +
      'Approach others with patience, and remember that inner strength grows when you remain true to your core values.'
  },
  {
    keywords: ['death', 'grief', 'loss', 'dying', 'passed away'],
    reply:
      'The Gita reminds us that the soul (Atman) is eternal; the body changes like a garment, but love and consciousness endure. ' +
      'Be gentle with your heart as you navigate this phase.'
  },
  {
    keywords: ['meditation', 'meditate', 'yoga', 'practice'],
    reply:
      'Sit comfortably and observe your breath for 5 quiet minutes without trying to force anything. ' +
      'When thoughts arise, gently return your awareness to the breath. Daily consistency is key.'
  },
  {
    keywords: ['forgive', 'forgiveness', 'guilt', 'mistake', 'regret'],
    reply:
      'Regret is meant to instruct us, not imprison us. ' +
      'Forgive yourself and others with compassion, learn the lesson, and dedicate your present actions to righteous living.'
  }
];

const DEFAULT_FALLBACK_REPLIES = [
  "सादर प्रणाम। Sanatan Darshan offers guidance for every life situation. Aap kis vishay par charcha karna chahte hain, aur kis bhasha me (Hindi, English, ya Hinglish)?",
  "ॐ नमः शिवाय। Welcome to Sanatan Saarthi. Tell me briefly what is on your mind, and which language you prefer — Hindi, English, or Hinglish?"
];

/**
 * Quick-prompt suggestion chips shown in the widget UI.
 */
const QUICK_PROMPTS = [
  'How to find inner peace?',
  'Gita shloka for motivation',
  'How do I stop overthinking?',
  'How to forgive someone?',
  'A short daily meditation practice'
];

function pickFallbackReply(message) {
  const text = (message || '').toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const entry of FALLBACK_LIBRARY) {
    const score = entry.keywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (best) return best.reply;
  return DEFAULT_FALLBACK_REPLIES[Math.floor(Math.random() * DEFAULT_FALLBACK_REPLIES.length)];
}

/**
 * Calls Gemini REST API directly using standard API key authentication.
 */
async function callGemini(history, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }]
    })),
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const payload = {
    contents,
    systemInstruction: {
      parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }]
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`got status: ${response.status} ${response.statusText}. ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

/**
 * Calls the Anthropic Messages API.
 */
async function callAnthropic(history, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: userMessage }
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: SAARTHI_SYSTEM_PROMPT,
        messages
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Anthropic API responded with ${response.status}`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock || !textBlock.text) throw new Error('Empty response from Anthropic API');
    return textBlock.text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * getSaarthiReply(history, userMessage) -> Promise<{ text: string, source: 'gemini' | 'llm' | 'fallback' }>
 */
async function getSaarthiReply(history, userMessage) {
  if (process.env.GEMINI_API_KEY) {
    try {
      const text = await callGemini(history, userMessage);
      return { text, source: 'gemini' };
    } catch (err) {
      console.error('[Saarthi] Gemini call failed, falling back:', err.message);
    }
  }

  try {
    const text = await callAnthropic(history, userMessage);
    return { text, source: 'llm' };
  } catch (err) {
    return { text: pickFallbackReply(userMessage), source: 'fallback' };
  }
}

module.exports = { getSaarthiReply, QUICK_PROMPTS, SAARTHI_SYSTEM_PROMPT, GEMINI_SYSTEM_INSTRUCTION };