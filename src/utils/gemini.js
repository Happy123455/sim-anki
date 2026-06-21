const API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Clean single backslashes in JSON strings that are not valid JSON escape sequences
export function escapeJsonLaTeX(str) {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < str.length) {
    const char = str[i];
    if (char === '"' && (i === 0 || str[i - 1] !== '\\')) {
      inString = !inString;
      result += char;
      i++;
      continue;
    }
    
    if (inString && char === '\\') {
      const nextChar = str[i + 1];
      if (nextChar === '"') {
        result += '\\"';
        i += 2;
      } else if (nextChar === '\\') {
        result += '\\\\';
        i += 2;
      } else {
        result += '\\\\';
        i++;
      }
    } else {
      result += char;
      i++;
    }
  }
  return result;
}

// Helper to clean API keys (strips whitespace, surrounding quotes)
export function cleanApiKey(key) {
  if (!key) return '';
  let cleaned = key.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

// Helper to clean model names (strips whitespace, surrounding quotes)
export function cleanModelName(model) {
  if (!model) return 'gemini-3.5-flash';
  let cleaned = model.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

// Helper to clean markdown code blocks before JSON parsing
function cleanAndParseJson(text) {
  let cleaned = text.trim();
  // Remove markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, ''); // remove start fence
    cleaned = cleaned.replace(/\n```$/, ''); // remove end fence
  }
  cleaned = escapeJsonLaTeX(cleaned.trim());
  return JSON.parse(cleaned);
}


/**
 * Validates the provided Gemini API key by making a minimal request.
 * 
 * @param {string} apiKey - Google Gemini API Key.
 * @param {string} model - The model identifier to test.
 * @returns {Promise<boolean>} True if API key is valid.
 */
export async function checkApiKey(apiKey, model = "gemini-3.5-flash") {
  const trimmedKey = cleanApiKey(apiKey);
  if (!trimmedKey) return false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6-second timeout
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    // A status of 200 OK means the API key is authorized and valid.
    return res.status === 200;
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("API Key check error:", e);
    return false;
  }
}

/**
 * Evaluates the user's typed response against the correct concept.
 * 
 * @returns {Promise<Object>} The graded report JSON object.
 */
export async function evaluateAnswer(apiKey, model, question, concept, userAnswer, timeSpent, confidence, consecutiveFails = 0, history = [], customInstructions = "", onStatusUpdate = () => {}) {
  const isEli5 = consecutiveFails >= 4;

  // Format previous history for Gemini
  let formattedHistory = "";
  if (history && history.length > 0) {
    formattedHistory = "\n[USER PREVIOUS REVIEW HISTORY ON THIS CARD]:\n";
    // Feed the last 4 reviews to keep context focused
    const recentHistory = history.slice(-4);
    recentHistory.forEach((h, idx) => {
      const dateStr = new Date(h.date).toLocaleDateString();
      formattedHistory += `${idx + 1}. Date: ${dateStr} | Score: ${h.score}% | User Answer: "${h.userAnswer || 'N/A'}" | Logic Error Identified: "${h.logicAnalysis || 'None'}"\n`;
    });
  }

  const systemPrompt = `You are an expert tutor grading a student's answer for a spaced repetition flashcard.
Your job is to analyze the student's answer, provide a score from 0 to 100, identify strengths, list logical gaps or incorrect concepts, analyze their errors, and provide a clear, concise markdown explanation of the concept that directly addresses their errors.

[CRITICAL BRIEFNESS REQUIREMENT]:
1. Keep all explanations extremely short, simple, and under 80 words total. Focus strictly on the core explanation with a quick 1-sentence analogy or real-world example.
2. The "strengths" and "weaknesses" lists must contain a maximum of 2 short bullet points each.
3. The "logicAnalysis" must be a direct advice on exactly "where to improve" in under 30 words (1 sentence max).

${formattedHistory ? `
[CRITICAL HISTORY DIAGNOSIS RULE]:
The student has reviewed this card in the past. Look at the attached [USER PREVIOUS REVIEW HISTORY ON THIS CARD].
Analyze whether they are:
- Repeating the EXACT SAME logical mistake they made in the past.
- Making a NEW mistake they haven't made before.
- Corrected their previous mistake (acknowledge it briefly).
Take into account how long it has been since their last review (today is ${new Date().toLocaleDateString()}).
Your "logicAnalysis" MUST briefly comment on this historical comparison (e.g. "You are still making the same mistake of..." or "You corrected your previous error about X, but you made a new mistake in Y.").
` : ''}

${isEli5 ? `[ELI5 REQUIREMENT] The student has failed to answer this card correctly ${consecutiveFails} times. You MUST explain the entire concept using an extreme "Explain Like I'm 5" (ELI5) style. Use an analogy appropriate for a 5-year-old child (e.g. playing with blocks, cakes, toy trucks) and simple vocabulary.` : ''}

Based on the score:
- score < 60: suggest "again"
- score 60-75: suggest "hard"
- score 75-90: suggest "good"
- score > 90: suggest "easy"

You must respond with a JSON object conforming exactly to this schema:
{
  "score": number (0 to 100),
  "strengths": string[],
  "weaknesses": string[],
  "logicAnalysis": string (direct advice on where to improve and brief comparison with history, 1-2 sentences),
  "correctExplanation": string (formatted in Markdown, under 150 words),
  "suggestedRating": "again" | "hard" | "good" | "easy"
}

${customInstructions ? `
[CRITICAL USER CUSTOM TUTOR INSTRUCTIONS / PREFERENCES]:
You MUST strictly follow these user preferences for style, tone, language, and formatting. They take precedence over standard instruction formats (e.g. if the user requests pirate speech, speak like a pirate in both "logicAnalysis" and "correctExplanation"):
"${customInstructions}"
` : ''}`;

  const prompt = `
Question: ${question}
Concept Focus: ${concept}
User's Answer: "${userAnswer}"
Time Spent: ${timeSpent} seconds (FYI ONLY - do NOT use this to affect score or rating)
User's Self-Reported Confidence: ${confidence}/5 (FYI ONLY - do NOT use this to affect score or rating)

[CRITICAL RULE]: Your evaluation (score, strengths, weaknesses, suggestedRating) must be based SOLELY on the accuracy, correctness, and completeness of the User's Answer. Do NOT decrease the score or downgrade the rating if the user answered quickly, slowly, or had low/high confidence. The Time Spent and Confidence are only logged for the user's statistics.
Please evaluate their response. Make sure to be constructive, pointing out exactly where their logic broke or what crucial elements they omitted.

${customInstructions ? `
[REMINDER: USER CUSTOM INSTRUCTIONS]:
You must output your response complying strictly with these user-defined preferences:
"${customInstructions}"
` : ''}
`;

  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  onStatusUpdate("Preparing request payload...");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    onStatusUpdate("Timeout reached! Aborting request...");
    controller.abort();
  }, 30000); // 30-second timeout

  onStatusUpdate(`Sending fetch request to Gemini API (Model: ${cleanModel})...`);
  try {
    const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              score: { type: "INTEGER" },
              strengths: {
                type: "ARRAY",
                items: { type: "STRING" }
              },
              weaknesses: {
                type: "ARRAY",
                items: { type: "STRING" }
              },
              logicAnalysis: { type: "STRING" },
              correctExplanation: { type: "STRING" },
              suggestedRating: { 
                type: "STRING", 
                enum: ["again", "hard", "good", "easy"] 
              }
            },
            required: ["score", "strengths", "weaknesses", "logicAnalysis", "correctExplanation", "suggestedRating"]
          }
        }
      })
    });

    clearTimeout(timeoutId);

    onStatusUpdate(`Response received with status ${response.status} (${response.statusText}). Reading content...`);

    if (!response.ok) {
      let errDetail = "";
      try {
        const errJson = await response.json();
        errDetail = errJson?.error?.message || response.statusText;
      } catch (e) {
        errDetail = await response.text() || response.statusText;
      }
      
      onStatusUpdate(`Error status ${response.status} received: ${errDetail}`);
      
      if (response.status === 503) {
        throw new Error(`Gemini API is currently overloaded (503 Service Unavailable). Gemini 3.5 models sometimes experience capacity limits. Please switch to 'Gemini 3.1 Flash-Lite' in Settings (it has better availability), or try again in a few seconds.`);
      }
      if (response.status === 401 || (response.status === 400 && errDetail.toLowerCase().includes("api key not valid"))) {
        throw new Error(`Invalid API key. Please check your Gemini API key in Settings and ensure there are no extra characters or quotes.`);
      }
      if (response.status === 403) {
        throw new Error(`Access Forbidden (403). Your API key may be invalid, restricted, or billing is not configured correctly. Details: ${errDetail}`);
      }
      throw new Error(`Gemini API Error (${response.status}): ${errDetail}`);
    }

    onStatusUpdate("Decoding JSON payload...");
    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      onStatusUpdate("Error: Gemini returned an empty response. This could be due to safety filters or API limits.");
      throw new Error("Gemini returned an empty response candidate list. Check safety settings or try again.");
    }
    
    onStatusUpdate("Parsing evaluation response...");
    const text = data.candidates[0].content.parts[0].text;
    const parsed = cleanAndParseJson(text);
    onStatusUpdate("Grading completed successfully!");
    return parsed;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      onStatusUpdate("Request aborted due to 30-second timeout limit.");
      throw new Error("Evaluation request timed out (30s limit). Please check your internet connection or try again.");
    }
    onStatusUpdate(`Request failed: ${err.message}`);
    throw err;
  }
}

/**
 * Generates an interactive simulation tailored to the user's specific logical misunderstanding.
 * 
 * @returns {Promise<Object>} The simulation config JSON object.
 */
export async function generateSimulation(apiKey, model, question, concept, lastIncorrectAnswer, logicAnalysis, customInstructions = "") {
  const systemPrompt = `You are a dynamic educational simulator designer. Your job is to create an interactive learning simulation related to a study topic.
You should choose between two types of simulations:
1. "calculator": A interactive playground with sliders (variables) and formula calculations. Best for mathematical, physical, engineering, economic, or quantitative concepts (e.g., beam bending, option pricing, chemical kinetics, gear ratios).
2. "scenario": A choice-based interactive case study/adventure. Best for qualitative, logical, legal, medical, coding, history, or management concepts (e.g. system design choice, debugging steps, medical diagnosis, ethical dilemma).

Choose the format that is most appropriate to explain the concept and help the user resolve their specific logical error:
Logic Error: "${logicAnalysis}"
Topic/Concept: "${concept}"
Question: "${question}"

You must respond with a JSON object.

[CRITICAL SVG DIAGRAM REQUIREMENT]:
For either simulation type, you MUST generate a visual, animated diagram in the "svgDiagram" field, along with a text description in the "svgDescription" field.
"svgDiagram": "A complete, valid, raw SVG string (e.g. '<svg viewBox=\"0 0 400 200\" width=\"100%\" height=\"auto\" xmlns=\"http://www.w3.org/2000/svg\">...</svg>'). Use standard native SVG animations (like <animate>, <animateTransform>, etc.) to make it visually move. Style it beautifully for a dark background (use purples, pinks, teals, white, grey for lines). Ensure it is complete, valid, and has no markdown code blocks inside the string."
"svgDescription": "A short, concise description (1-2 sentences) of what the animated SVG diagram depicts, which will be read out loud via text-to-speech voiceover."

[INTERACTIVE/REACTIVE SVG BINDING]:
To make the SVG interactive and reactive, you can use curly-brace placeholders containing variable or formula names (e.g. '{load}', '{wsmStress}', '{deflection}') anywhere inside the SVG text, attributes, or styles (for example: '<text x=\"10\" y=\"20\">Load: {load} kN</text>', or '<circle r=\"{wsmStress}\" .../>', or a transform attribute like 'transform=\"translate(0, {deflection})\"'). The renderer will automatically substitute these placeholders with their active values as the user adjusts the sliders, causing the SVG shapes and text to update instantly!"

If you choose "calculator", return this JSON structure:
{
  "simulationType": "calculator",
  "title": "A short, engaging title",
  "description": "Explains the goal of the simulation and how it helps clarify the concept.",
  "challenge": "A specific task for the user, e.g., 'Find the beam thickness needed so WSM does not collapse under 40kN load, then check its LSM safety.'",
  "svgDiagram": "complete valid raw SVG string with animations",
  "svgDescription": "short text description for voiceover",
  "variables": [
    {
      "name": "VariableName (alphanumeric, camelCase, e.g., 'load')",
      "label": "User-friendly Label (e.g., 'Imposed Load')",
      "unit": "e.g., 'kN/m' or 'mm'",
      "min": number,
      "max": number,
      "step": number,
      "default": number
    }
  ],
  "formulas": [
    {
      "output": "OutputVariableName (e.g., 'wsmStress')",
      "label": "User-friendly Output Label (e.g., 'WSM Stress')",
      "unit": "e.g., 'MPa'",
      "expression": "A safe JavaScript mathematical expression using inputs and Math functions, e.g., '(load * 1.5 * 1000) / (width * depth)' or 'Math.sqrt(load / 3)'"
    }
  ],
  "explanations": [
    {
      "condition": "A JS conditional expression in terms of output/input variables, e.g., 'wsmStress > 150'",
      "text": "Feedback when this condition is true (e.g. 'WSM stress exceeds material capacity! The structure bends permanently.')"
    },
    {
      "condition": "wsmStress <= 150",
      "text": "Feedback when stable."
    }
  ]
}

If you choose "scenario", return this JSON structure:
{
  "simulationType": "scenario",
  "title": "A short, engaging title",
  "description": "Overview of the scenario/situation.",
  "introduction": "Introductory text setting up the story/problem.",
  "svgDiagram": "complete valid raw SVG string with animations",
  "svgDescription": "short text description for voiceover",
  "stages": [
    {
      "id": number (e.g., 1),
      "description": "Situation description for this stage. What is happening?",
      "choices": [
        {
          "text": "The text of this action or choice.",
          "feedback": "Feedback showing immediate consequences of this decision.",
          "nextStageId": number (the ID of the next stage to go to, or null if this is an ending),
          "isCorrect": boolean (whether this is a good, sound choice aligned with correct logic)
        }
      ]
    }
  ]
}

Keep all formula expressions safe. Do not use complex javascript syntax, only basic arithmetic operators (+, -, *, /), parentheses, commas, and Math functions (Math.sqrt, Math.pow, Math.max, Math.min, Math.PI, Math.log, Math.exp).
Ensure the simulation is highly engaging and directly targets the student's logical misunderstanding.`;

  const prompt = `
Generate a simulation for:
Question: ${question}
Concept Focus: ${concept}
User's Logical Gaps: "${logicAnalysis}"
User's Incorrect Answer: "${lastIncorrectAnswer}"

${customInstructions ? `
[USER CUSTOM TUTOR PREFERENCES]:
"${customInstructions}"
` : ''}

Design a custom calculator or a decision scenario to help them visually/interactively correct their logic. Return only the JSON object. Do not include any markdown fences or wrapping other than the raw JSON string.
`;

  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  return cleanAndParseJson(text);
}
