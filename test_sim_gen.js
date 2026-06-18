import { generateSimulation, evaluateAnswer } from './src/utils/gemini.js';

const key = process.env.GEMINI_API_KEY || "";

async function retryCall(fn, ...args) {
  const models = ["gemini-2.5-flash", "gemini-2.5-pro"];
  let lastErr = null;
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Trying call with model ${model} (attempt ${attempt})...`);
        const res = await fn(key, model, ...args);
        return res;
      } catch (err) {
        lastErr = err;
        console.warn(`Attempt failed with error: ${err.message}. Retrying...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr;
}

async function runTest() {
  try {
    console.log("1. Testing evaluateAnswer with customInstructions...");
    const evaluation = await retryCall(
      evaluateAnswer,
      "What is the key difference between WSM and LSM?",
      "WSM vs LSM structural design philosophy",
      "WSM uses ultimate load factors and LSM uses service loads.",
      10, // timeSpent
      4,  // confidence
      0,  // consecutiveFails
      [], // history
      "Explain using concrete beam analogies. End explanation with 'Beep Boop'."
    );
    console.log("Evaluation Success! Output keys:", Object.keys(evaluation));
    console.log("Evaluation Suggested Rating:", evaluation.suggestedRating);
    console.log("Explanation Preview:", evaluation.correctExplanation.slice(-30));
    console.log("Logic Analysis:", evaluation.logicAnalysis);
    
    console.log("\n2. Testing generateSimulation with customInstructions...");
    const result = await retryCall(
      generateSimulation,
      "What is the key difference between WSM and LSM?",
      "WSM vs LSM structural design philosophy",
      "WSM uses ultimate load factors and LSM uses service loads.",
      evaluation.logicAnalysis,
      "Use purple and teal theme for SVG diagram. Explain using concrete beam analogies."
    );
    console.log("Simulation Success! Output keys:", Object.keys(result));
    console.log("Title:", result.title);
    console.log("Simulation Type:", result.simulationType);
    if (result.svgDiagram) {
      console.log("SVG Diagram exists. Length:", result.svgDiagram.length);
      console.log("SVG Diagram preview:", result.svgDiagram.slice(0, 150));
    } else {
      console.warn("WARNING: svgDiagram field is missing!");
    }
    if (result.svgDescription) {
      console.log("SVG Description:", result.svgDescription);
    } else {
      console.warn("WARNING: svgDescription field is missing!");
    }
  } catch (err) {
    console.error("Test failed with error:", err.message);
  }
}

runTest();
