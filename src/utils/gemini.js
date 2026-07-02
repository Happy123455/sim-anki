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
 * Automatically categorizes an array of cards into 'logic', 'rote', or 'vocabulary'
 */
export async function autoCategorizeCards(apiKey, model, cards) {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);
  
  const systemPrompt = `You are an expert AI instructional designer. Your task is to categorize a list of flashcards.
For each card, classify its 'cardType' as EXACTLY ONE of the following:
- "rote": Simple facts, numbers, dates, equations without proofs, names. Needs strict memorization.
- "vocabulary": Language translation, terminology definitions, word meanings.
- "logic": Conceptual questions, "how" or "why" questions, mechanisms, multi-step reasoning, comparisons.

Respond with a JSON array where each object has "id" (the card's ID) and "cardType" (the determined category).
`;

  // We only send id, question, and concept to save tokens
  const payloadCards = cards.map(c => ({ id: c.id, question: c.question, concept: c.concept }));
  
  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nCards: " + JSON.stringify(payloadCards) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              cardType: { type: "STRING", enum: ["rote", "vocabulary", "logic", "default"] }
            },
            required: ["id", "cardType"]
          }
        }
      }
    })
  });

  if (!response.ok) throw new Error("Categorization request failed");
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Invalid response format");
  
  return JSON.parse(text);
}


/**
 * Evaluates the user's typed response against the correct concept.
 * 
 * @returns {Promise<Object>} The graded report JSON object.
 */
export async function evaluateAnswer(apiKey, model, question, concept, userAnswer, timeSpent, confidence, consecutiveFails = 0, history = [], customInstructions = "", onStatusUpdate = () => {}, cardType = "default") {
  const isNewCard = !history || history.length === 0;
  const isEli5 = consecutiveFails >= 4 || isNewCard;

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
Your job is to analyze the student's answer, provide a score from 0 to 100, suggest a rating ('again', 'hard', 'good', 'easy'), identify strengths/weaknesses (maximum of 2 short bullet points each), and provide a direct evaluation.

[OPTIMIZATION & TOKEN SAVING RULES]:
1. If the student's answer is 100% correct:
   - score = 100
   - suggestedRating = "easy"
   - correctExplanation = "🎉 Excellent recall! Your answer is 100% correct."
   - strengths = []
   - weaknesses = []
   - logicAnalysis = "Perfect! 🎯"
   - highlights = []
   - conceptHighlights = []
   - omittedItems = []
   Keep it extremely minimal.

2. If the answer is imperfect (< 100%):
   - logicAnalysis: Focus strictly on what went wrong. You MUST use bracketed notation like "(missing keyword/phrase)" to explicitly show what missing words, details, or context should be added to achieve 100%. Emojify key concepts to make them highly scannable (e.g. "You missed the 💡 concept of..."). Keep it under 30 words.
   - correctExplanation: Keep it extremely concise (under 30 words), stating only the core correction. DO NOT include detailed pros/cons or extended explanations here.

3. puzzlePieces:
   Decompose the correct "Concept Focus" reference concept into 3 to 6 logical chunks of text (words or phrases) that fit together to form the full correct answer. For each chunk, provide a matching context-relevant emoji to visually represent it in the UI.

4. omittedItems:
   Identify 1 to 3 specific terms/keywords that the student missed (max 3 items, 1-3 words each).

5. numericalAnalysis (CRITICAL for number-based questions):
   If the question, concept focus, or student's answer contains numerical facts, values, parameters, dimensions, percentages, or statistics:
   - containsNumbers: true
   - actualValue: the correct numerical value from the concept focus or target answer (as a float/number)
   - userGuess: the number the student provided in their answer (as a float/number). If the student's answer does not contain a clear number but should have, set this to 0 or estimate.
   - valueUnit: the metric or unit of measurement (e.g. "kN", "MPa", "%", "m", "kg", or "" if none).
   If there are NO numbers involved in the card topic/answer, return containsNumbers: false, actualValue: 0, userGuess: 0, valueUnit: "".

[MEMORY ANCHOR & STORIES RULE]:
Whenever possible, particularly for imperfect answers, weave a tiny historical context, a striking real-world impact story/analogy, or a quirky fun fact into the correctExplanation or logicAnalysis (under 40 words) to transform the dry data into a memorable experience and anchor it in their mind.

${formattedHistory ? `
[CRITICAL HISTORY DIAGNOSIS RULE]:
The student has reviewed this card in the past. Look at the attached [USER PREVIOUS REVIEW HISTORY ON THIS CARD].
Analyze whether they are repeating the same mistake or made a new mistake, and note this in your logicAnalysis under 15 words.
` : ''}

${cardType === 'rote' || cardType === 'vocabulary' ? `
[ROTE/VOCABULARY CARD REQUIREMENT]:
This is a "${cardType}" card, which requires memorization of facts, numbers, or simple translations. Focus purely on literal gaps.
` : `
[LOGIC CARD REQUIREMENT]:
This is a logic or conceptual card. Focus on identifying logical gaps, misconceptions, and structural errors.
`}

Based on the score:
- score < 60: suggest "again"
- score 60-75: suggest "hard"
- score 75-90: suggest "good"
- score > 90: suggest "easy"

[HIGHLIGHTING REQUIREMENT]:
1. Analyze the student's answer text ("User's Answer"). Identify specific words or short phrases that are correct (green), spelling error (yellow), or incorrect (red). Return these in highlights.
2. Analyze the card's original reference concept text ("Concept Focus"). Identify main key words (main) and missed details (missed) in conceptHighlights.

You must respond with a JSON object conforming exactly to this schema:
{
  "score": number (0 to 100),
  "strengths": string[],
  "weaknesses": string[],
  "logicAnalysis": string (direct advice on where to improve, 1-2 sentences),
  "correctExplanation": string (formatted in Markdown, under 40 words),
  "suggestedRating": "again" | "hard" | "good" | "easy",
  "highlights": Array<{ text: string, color: "green" | "yellow" | "red", reason: string }>,
  "conceptHighlights": Array<{ text: string, type: "main" | "missed", reason: string }>,
  "omittedItems": string[],
  "puzzlePieces": Array<{ text: string, emoji: string }>,
  "memoryAnchor": string (a brief story-driven memory anchor under 40 words. Weave in a historical backstory or success/disaster related to the concept, subtly nudging the student toward the steps and importance of the answer),
  "numericalAnalysis": {
    "containsNumbers": boolean,
    "actualValue": number,
    "userGuess": number,
    "valueUnit": string
  }
}

${customInstructions ? `
[CRITICAL USER CUSTOM TUTOR INSTRUCTIONS / PREFERENCES]:
You MUST strictly follow these user preferences:
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
              },
              highlights: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    text: { type: "STRING" },
                    color: { type: "STRING", enum: ["green", "yellow", "red"] },
                    reason: { type: "STRING" }
                  },
                  required: ["text", "color", "reason"]
                }
              },
              conceptHighlights: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    text: { type: "STRING" },
                    type: { type: "STRING", enum: ["main", "missed"] },
                    reason: { type: "STRING" }
                  },
                  required: ["text", "type", "reason"]
                }
              },
              omittedItems: {
                type: "ARRAY",
                items: { type: "STRING" }
              },
              puzzlePieces: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    text: { type: "STRING" },
                    emoji: { type: "STRING" }
                  },
                  required: ["text", "emoji"]
                }
              },
              numericalAnalysis: {
                type: "OBJECT",
                properties: {
                  containsNumbers: { type: "BOOLEAN" },
                  actualValue: { type: "NUMBER" },
                  userGuess: { type: "NUMBER" },
                  valueUnit: { type: "STRING" }
                },
                required: ["containsNumbers", "actualValue", "userGuess", "valueUnit"]
              },
              memoryAnchor: { type: "STRING" }
            },
            required: ["score", "strengths", "weaknesses", "logicAnalysis", "correctExplanation", "suggestedRating", "highlights", "conceptHighlights", "omittedItems", "puzzlePieces", "numericalAnalysis", "memoryAnchor"]
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

/**
 * Generates a conceptual mind map for the deck based on its cards.
 * 
 * @returns {Promise<Object>} The mind map tree structure.
 */
export async function generateMindMap(apiKey, model, deckTitle, deckDescription, cardsList) {
  const systemPrompt = `You are an expert educator and visual learning designer. Your job is to create a structured conceptual mind map of a study deck.
You will receive the deck title, deck description, and a list of cards (with their IDs, questions, and concept focus areas).
Analyze the relationships, group related cards/topics into main subtopics, and organize them into a clean, hierarchical tree structure (up to 3-4 levels deep).

The root of the tree should represent the overall deck theme.
Level 1: Main categories or chapters (e.g., "Structural Design", "Hydraulic Principles").
Level 2: Sub-topics under those categories.
Level 3: Core concepts, questions, or key facts.

[CRITICAL CARD ID MAPPING RULE]:
Every single card in the provided list MUST be represented in the tree. You can map one or more card IDs to a leaf node by populating its "cardIds" array. If a node is a high-level folder/category that groups multiple sub-branches, leave "cardIds" empty or null.
Ensure that every single Card ID from the input list is assigned to at least one node's "cardIds" array, so no cards are omitted from the mind map. If multiple cards talk about the same sub-topic or have similar concepts, group their card IDs together in the same "cardIds" array.

You must respond with a JSON object representing the root node of this tree, conforming exactly to the requested schema. Ensure the mind map is cohesive, comprehensive, and logically structured.`;

  const cardsSummary = (cardsList || []).map((c, idx) => `Card ID: "${c.id}" | Q: "${c.question}" | Concept: "${c.concept || ''}"`).join('\n');
  const prompt = `
Deck Title: ${deckTitle}
Deck Description: ${deckDescription}

Here is the list of cards in this deck:
${cardsSummary}

Please organize these cards into a logical conceptual mind map hierarchy. Return only the JSON object.`;

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
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            label: { type: "STRING" },
            cardIds: {
              type: "ARRAY",
              items: { type: "STRING" }
            },
            children: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  label: { type: "STRING" },
                  cardIds: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                  },
                  children: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        label: { type: "STRING" },
                        cardIds: {
                          type: "ARRAY",
                          items: { type: "STRING" }
                        },
                        children: {
                          type: "ARRAY",
                          items: {
                            type: "OBJECT",
                            properties: {
                              label: { type: "STRING" },
                              cardIds: {
                                type: "ARRAY",
                                items: { type: "STRING" }
                              }
                            },
                            required: ["label"]
                          }
                        }
                      },
                      required: ["label"]
                    }
                  }
                },
                required: ["label"]
              }
            }
          },
          required: ["label", "children"]
        }
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

/**
 * Handles a single step in the interactive tutor chat.
 */
export async function chatTutorStep(apiKey, model, question, concept, userAnswer, currentItem, chatHistory = [], userMessage = "") {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const formattedHistory = chatHistory.map(msg => 
    `${msg.sender === 'user' ? 'Student' : 'Tutor'}: "${msg.text}"`
  ).join("\n");

  const systemPrompt = `You are a friendly, encouraging AI tutor helping a student learn a concept step-by-step.
The student recently tried to answer a flashcard question and omitted some key information. We are helping them recall/learn the missing parts.

[Context]:
- Question: ${question}
- Reference Answer (Concept): ${concept}
- Student's Initial Answer: "${userAnswer}"
${currentItem ? `- The current missing word/number/concept they need to explain or recall: "${currentItem}"` : '- The student has completed all omissions or has a general question/comment. Help them clarify their thoughts or answer their question in a friendly tutor way.'}

[Chat History]:
${formattedHistory || "None (First message)"}

[Student's New Comment/Explanation]:
"${userMessage}"

[Task]:
1. Respond to the student's explanation in a friendly, constructive, extremely short one-line response (under 25 words).
2. Assess if the student's comment correctly explains, recalls, or shows understanding of the current missing word/number/concept ("${currentItem}").
   - If they successfully explained/recalled it or answered why correctly, set "resolved" to true.
   - If they are still missing it, confused, or got it wrong, keep "resolved" as false.
   - If there is no active missing item, default "resolved" to true.
3. Highlight words in the student's explanation if appropriate. Specifically, return a list of "highlights" that map exact substrings in the STUDENT'S new message to colors:
   - "green" for correct explanations or accurate key terms.
   - "red" for wrong assumptions, incorrect facts, or logic errors.
   - "yellow" for minor errors or spelling.
   Each highlight object must have "text" (the exact substring from the user's message), "color" ("green"|"yellow"|"red"), and "reason".

You must respond with a JSON object conforming exactly to this schema:
{
  "response": string (short one-line guidance/feedback, under 25 words),
  "resolved": boolean (true if the student successfully recalled/explained this specific item, false otherwise),
  "highlights": Array<{ text: string, color: "green" | "yellow" | "red", reason: string }>
}
`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: systemPrompt }] }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            response: { type: "STRING" },
            resolved: { type: "BOOLEAN" },
            highlights: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  text: { type: "STRING" },
                  color: { type: "STRING", enum: ["green", "yellow", "red"] },
                  reason: { type: "STRING" }
                },
                required: ["text", "color", "reason"]
              }
            }
          },
          required: ["response", "resolved", "highlights"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Tutor Chat failed: ${response.statusText} (${errText})`);
  }

  const data = await response.json();
  const rawText = data.candidates[0].content.parts[0].text;
  return cleanAndParseJson(rawText);
}

/**
 * Generates a creative, memorable mnemonic device (story, rhyme, or visual shape association)
 * for a card's question, concept, and any numbers/formulas.
 * 
 * @returns {Promise<string>} The generated mnemonic text.
 */
export async function generateMnemonic(apiKey, model, question, concept) {
  const systemPrompt = `You are a memory expert specializing in mnemonic systems (like the Major System, Number-Shape System, visual associations, and creative stories).
Your task is to take a concept, question, and any numbers/formulas, and generate a fun, vivid, highly-memorable mnemonic device (memory hook) to help the student remember it easily.
Make the explanation very short (under 60 words). Use rich visual descriptions, weird or funny associations, or simple rhymes.
If there are numbers involved, explicitly suggest a visual shape connection (e.g. 0 = donut, 1 = candle, 2 = swan, 3 = butterfly, 4 = sailboat, 5 = hook, 6 = cherry, 7 = boomerang, 8 = snowman, 9 = balloon) or a quick word association.
Keep the tone warm, friendly, and encouraging. Respond in plain text or simple markdown.`;

  const prompt = `
Question: ${question}
Concept Focus: ${concept}
`;

  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mnemonic generation failed: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response from Gemini API");
  }
  return text.trim();
}

/**
 * Aggregates study stats and error logs, and calls Gemini to generate a personalized User Difficulty Profile.
 */
export async function generateCognitiveProfile(apiKey, model, cardsWithHistory) {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const simplifiedCards = cardsWithHistory.map(c => {
    const history = c.history || [];
    const avgScore = history.length > 0 
      ? Math.round(history.reduce((sum, h) => sum + (h.score || 0), 0) / history.length) 
      : 0;
    const fails = history.filter(h => h.rating === 'again').length;
    const recentErrors = history
      .map(h => h.logicAnalysis)
      .filter(e => e && e.trim() && e !== 'None')
      .slice(-3); // get last 3 errors

    return {
      question: c.question.slice(0, 100) + (c.question.length > 100 ? "..." : ""),
      concept: c.concept.slice(0, 100) + (c.concept.length > 100 ? "..." : ""),
      cardType: c.cardType || "default",
      reps: history.length,
      fails,
      avgScore,
      recentErrors
    };
  });

  const systemPrompt = `You are an expert cognitive psychologist and educational data analyst.
Analyze the student's flashcard review stats and history logs below.
Look for cognitive patterns in where the student struggles or excels.
Identify factors like card type (rote vs logic vs vocabulary), card length, and types of logical errors.

Provide a structured, encouraging, and detailed profile of their strengths and weaknesses, along with actionable study advice.

You must respond with a JSON object conforming exactly to this schema:
{
  "excelsAt": ["string", "string"],
  "strugglesWith": ["string", "string"],
  "detailedAnalysis": "string (Markdown format, 2-3 paragraphs analyzing their performance)",
  "recommendedFocus": "string (Actionable advice on what review style or refactoring options they should use)"
}`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nStudent Card Stats:\n" + JSON.stringify(simplifiedCards) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            excelsAt: { type: "ARRAY", items: { type: "STRING" } },
            strugglesWith: { type: "ARRAY", items: { type: "STRING" } },
            detailedAnalysis: { type: "STRING" },
            recommendedFocus: { type: "STRING" }
          },
          required: ["excelsAt", "strugglesWith", "detailedAnalysis", "recommendedFocus"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Profile generation failed: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Predictively grades the baseline difficulty of new, unreviewed cards in batches.
 */
export async function predictCardDifficulties(apiKey, model, cards) {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const payloadCards = cards.map(c => ({
    id: c.id,
    question: c.question,
    concept: c.concept
  }));

  const systemPrompt = `You are an expert AI tutor. Analyze the following flashcards and predictively grade their baseline difficulty.
Classify each card's difficulty as one of: "easy", "medium", or "hard".
- "easy": Simple definitions, direct lookup questions, short rote facts.
- "medium": Multi-concept translations, basic calculations, questions requiring explanation of one concept.
- "hard": Complex system comparisons, quantitative formulas with multiple steps, lengthy or highly technical concepts.

Provide a short 1-sentence reason explaining why it has this difficulty.

You must respond with a JSON array conforming exactly to this schema:
[
  {
    "id": "card ID",
    "difficulty": "easy" | "medium" | "hard",
    "reason": "explanation of difficulty rating"
  }
]`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nCards:\n" + JSON.stringify(payloadCards) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              id: { type: "STRING" },
              difficulty: { type: "STRING", enum: ["easy", "medium", "hard"] },
              reason: { type: "STRING" }
            },
            required: ["id", "difficulty", "reason"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Predictive grading failed: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Refactors a card rated "Hard" using either Text Simplification (Method A) or Atomic Splitting (Method B).
 */
export async function refactorHardCard(apiKey, model, card, method, customInstructions = "") {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const systemPrompt = `You are an expert educational designer specializing in flashcard optimization (minimizing cognitive load, keeping cards atomic, applying the Minimum Information Principle).
Your task is to refactor a "Hard" card to make it easier for the student to study and recall.

You have two methods at your disposal:
1. "simplify" (Method A - Text Simplification): Rewrite the verbose, complicated, or wordy question and concept to be highly concise and clear. The core knowledge/information must not be altered, lost, or damaged. Keep LaTeX formatting/formulas intact but explain them simpler.
2. "split" (Method B - Atomic Splitting): Divide a card containing too much information (multiple questions or compound concepts) into 2 or more separate, atomic child cards. Each child card must test exactly one fact or logical step.

If method is "auto", you must decide which method is most appropriate:
- If the card has a lot of details or multiple parts, choose "split".
- If the card is just verbose or confusingly written, choose "simplify".

You must respond with a JSON object conforming exactly to this schema:
{
  "methodApplied": "simplify" | "split",
  "explanation": "Brief explanation of what changes you made and why.",
  "simplifiedCard": {
    "question": "simplified question text",
    "concept": "simplified concept reference answer"
  },
  "splitCards": [
    {
      "question": "child card 1 question",
      "concept": "child card 1 concept focus reference answer"
    },
    {
      "question": "child card 2 question",
      "concept": "child card 2 concept focus reference answer"
    }
  ]
}

Ensure "simplifiedCard" is populated if methodApplied is "simplify".
Ensure "splitCards" contains at least 2 cards if methodApplied is "split".
`;

  const prompt = `
Original Card:
Question: ${card.question}
Concept: ${card.concept}
Requested Refactoring Method: ${method}
${customInstructions ? `Additional User Instructions: "${customInstructions}"` : ""}
`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            methodApplied: { type: "STRING", enum: ["simplify", "split"] },
            explanation: { type: "STRING" },
            simplifiedCard: {
              type: "OBJECT",
              properties: {
                question: { type: "STRING" },
                concept: { type: "STRING" }
              },
              required: ["question", "concept"]
            },
            splitCards: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  question: { type: "STRING" },
                  concept: { type: "STRING" }
                },
                required: ["question", "concept"]
              }
            }
          },
          required: ["methodApplied", "explanation"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Refactoring request failed: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Fetches comprehensive deep analysis (Pros, Cons, and Detailed Explanation).
 * Only invoked when the user clicks the lazy-load analysis button.
 */
export async function getDetailedAnalysis(apiKey, model, question, concept, userAnswer) {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const systemPrompt = `You are an expert AI tutor providing a comprehensive, deep pedagogical analysis of a student's flashcard review.
Analyze the question, the reference concept, and the user's answer.
Provide a detailed breakdown with:
1. Pros: What parts of their answer were accurate, well-phrased, or showed good understanding.
2. Cons: Exact misconceptions, logical errors, or formatting gaps.
3. Detailed Explanation: A thorough explanation of the underlying concept, how it applies to this question, and how to remember it next time.

You must respond with a JSON object conforming exactly to this schema:
{
  "pros": ["string", "string"],
  "cons": ["string", "string"],
  "detailedExplanation": "string (formatted in Markdown, detailed pedagogical breakdown)"
}`;

  const prompt = `
Question: ${question}
Reference Concept: ${concept}
User's Answer: "${userAnswer}"
`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            pros: { type: "ARRAY", items: { type: "STRING" } },
            cons: { type: "ARRAY", items: { type: "STRING" } },
            detailedExplanation: { type: "STRING" }
          },
          required: ["pros", "cons", "detailedExplanation"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to retrieve detailed analysis: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Generates or upgrades a 3D isometric visual explanation using SVG and CSS animations.
 */
export async function generate3DVisualAnimation(apiKey, model, questionOrConcept, targetType, feedback = "", previousSvg = "") {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const isQuestionSide = targetType === 'question';
  const systemPrompt = `You are an expert designer and frontend developer specializing in creating visually stunning, premium-quality SVG illustrations and 3D-looking animations.
Generate a valid, standalone, animated SVG (Scalable Vector Graphics) markup that visually explains and represents the following card ${isQuestionSide ? 'question setup/context' : 'answer/concept'}:
"${questionOrConcept}"

Guidelines for high-end aesthetics & 3D styling:
1. Use rich isometric projections, layered graphics, shadows, and perspective gradient fills to create a sense of depth and 3D modeling.
2. Use a cohesive, premium modern dark-theme color palette (e.g. violet, neon blue, pink, deep dark backdrops, bright accent gradients, glassmorphism) matching SimAnki's aesthetics.
3. Incorporate smooth CSS animations (e.g. rotating layers, floating elements, fading connections, pulsing paths, scaling widgets) using inline <style> and @keyframes.
4. Ensure all elements are clean, vector-based, and highly readable. Do NOT use external images or fonts. Keep the SVG self-contained. Make it scale nicely by defining a proper viewBox (e.g. viewBox="0 0 400 300").
${isQuestionSide ? `5. [CRITICAL QUESTION SIDE RULE]: Do NOT under any circumstances draw, write, label, or display the actual answer, formula solution values, or resolution of the question. You must ONLY visualize the starting conditions, physical parameters, system geometry, or problem context. Use a visual '?' or hint graphics to encourage the student to calculate or recall the answer themselves.` : ''}
${previousSvg ? `6. If a previous SVG is provided, analyze the previous SVG:
   [Previous SVG]: ${previousSvg}
   And user feedback for upgrades:
   [User Feedback]: ${feedback}
   Upgrading means merging the previous design and the new instructions. Decide how to blend them, adding more details, clearer diagrams, annotating components, or refining animation speeds, without losing the 3D aesthetic.` : ''}
7. Return ONLY valid SVG markup inside a JSON object conforming to this schema:
   {
     "svg": "string containing the full standalone <svg>...</svg> content"
   }`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            svg: { type: "STRING" }
          },
          required: ["svg"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate 3D visual animation: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Simplifies a complex flashcard question into a beginner-friendly explanation.
 */
export async function simplifyQuestion(apiKey, model, question, concept) {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const systemPrompt = `You are a friendly, expert educational tutor.
Your task is to take a flashcard question and its reference concept, and explain what the question is trying to ask in simple, clear, and beginner-friendly terms.
Break down any complex terminology, jargon, or confusing phrasing, and summarize what key concepts the student needs to focus on to answer.

[CRITICAL SECURITY RULE]: Do NOT under any circumstances reveal, output, or state the correct answer, solution, formulas, key numbers, or target answers to the question. You are simplifying the question setup, NOT answering it. Instead, end with a tiny, encouraging hint or nudging question to guide their learning process without giving the answer away.
Keep the explanation brief (2-4 sentences max).

Respond with a JSON object conforming exactly to this schema:
{
  "explanation": "string (plain English explanation of what the question is asking, with no answer spoilers, ending in a tiny hint)"
}`;

  const prompt = `
Question: ${question}
Concept: ${concept}
`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            explanation: { type: "STRING" }
          },
          required: ["explanation"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to simplify question: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Generates an interactive educational HTML/JS simulation tailored to a concept.
 */
export async function generateCanvasSimulation(apiKey, model, question, concept, logicAnalysis, userFeedback = "", previousHtml = "") {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const systemPrompt = `You are a world-class creator of interactive educational widgets and web simulations, similar to Brilliant.org or PhET Interactive Simulations.
Your task is to create or iterate upon a complete, self-contained, interactive HTML5 learning simulation page to help a student master this concept:
Concept: "${concept}"
Context: "${question}"
Logical Error to address: "${logicAnalysis}"

${previousHtml ? `You are upgrading/updating an existing simulation. Here is the current HTML code of the simulation:
\`\`\`html
${previousHtml}
\`\`\`
Modify and improve this simulation code based on the student's request: "${userFeedback}"` : `Create a new simulation from scratch.`}

Requirements:
1. The output MUST be a single, standalone HTML page containing all styles (CSS) and script (Javascript) inline. Do NOT import external scripts or stylesheets (except standard icons or styling fonts if necessary, but keep it self-contained for reliability).
2. Design Aesthetics: Use a stunning modern dark mode matching SimAnki's aesthetics (background: #0d0e15, glassmorphic panels, glowing neon highlights in violet (#8b5cf6), teal (#14b8a6), or pink (#ec4899), clean typography).
3. Interactivity: Include interactive controls (sliders, input ranges, toggle buttons, or click targets) so the student can experiment. Adjusting controls must immediately update an animated visual diagram (using HTML5 Canvas, HTML DOM elements, animated SVGs, or dynamic CSS styles).
4. Pedagogical: Provide a mini-challenge, sandbox playground, or interactive question. For example, "Adjust the beam reinforcement density until the deflection is safe (< 10mm)". Show clear feedback (Success/Try Again) when they achieve the goal.
5. Voice Explainer: Include a small "🔊 Explainer Voiceover" button in the simulation that reads the simulation goal aloud using browser SpeechSynthesis (window.speechSynthesis).

Return ONLY a JSON object conforming exactly to this schema:
{
  "html": "string containing the full standalone HTML page code"
}`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            html: { type: "STRING" }
          },
          required: ["html"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate canvas simulation: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Generates a highly detailed, storytelling memory anchor to make a concept memorable.
 */
export async function generateDetailedMemoryAnchor(apiKey, model, question, concept, logicAnalysis, currentAnswer) {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const systemPrompt = `You are a master scientific storyteller and historical educator.
Your task is to write a highly engaging, detailed, and rich storytelling Memory Anchor (backstory and quirky fun facts) to make the following concept memorable:
Concept: "${concept}"
Context: "${question}"
Student's Answer: "${currentAnswer}"
Logic gap to address: "${logicAnalysis}"

Requirements:
1. Write a detailed, captivating narrative (150-250 words) that connects this dry concept to:
   - A historical backstory (how it was discovered, who did it, their struggles, or quirky historical events).
   - Real-world impacts or engineering successes/disasters (e.g. why the bridge collapsed, why the space mission failed, or how it saved lives).
   - Dynamic and quirky facts that stick to the mind.
2. Subtly nudge the student: Weave in a non-obvious clue regarding the SEQUENCE of steps, core mechanisms, or relative IMPORTANCE of components in the target concept. By the end of reading the narrative, the student should naturally grasp the chronological order of operations or why certain elements matter more, without you explicitly spoiling or listing the exact answer text.
3. Use beautiful Markdown formatting (such as bold key phrases, lists, paragraph breaks, blockquotes, or highlights) to make the story highly organized, structured, and pleasant to read.
4. Return ONLY a JSON object conforming exactly to this schema:
{
  "memoryAnchor": "string (the rich, detailed story, formatted in Markdown)"
}`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            memoryAnchor: { type: "STRING" }
          },
          required: ["memoryAnchor"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate rich memory anchor: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}

/**
 * Generates a subtle, non-obvious hint focused on the steps and sequence of the answer.
 */
export async function generateAnswerNudge(apiKey, model, question, concept) {
  const trimmedKey = cleanApiKey(apiKey);
  const cleanModel = cleanModelName(model);

  const systemPrompt = `You are a cognitive learning assistant. Your task is to provide a subtle, non-obvious nudge/hint to help a student recall the correct answer to this card:
Question: "${question}"
Concept/Target Answer: "${concept}"

Your nudge MUST follow these rules:
1. Do NOT state the actual answer, formula solutions, or direct facts.
2. Focus on the SEQUENCE of steps, or the relative IMPORTANCE of components (e.g., "Think about what must be safety-adjusted first before you amplify...", "Consider the order of fabrication places...").
3. Use guiding questions or a brief structural checklist to nudge their memory.
4. Keep it very short (1-2 sentences, maximum 40 words).

Return ONLY a JSON object conforming exactly to this schema:
{
  "nudge": "string containing the subtle nudge"
}`;

  const response = await fetch(`${API_URL}/${cleanModel}:generateContent?key=${trimmedKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            nudge: { type: "STRING" }
          },
          required: ["nudge"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate answer nudge: ${response.statusText}. Details: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParseJson(rawText);
}


