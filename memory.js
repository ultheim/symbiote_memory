// ============================================
// MEMORY MODULE (memory.js) - OPTIMIZED HYBRID
// ============================================
// This version combines V1's fast retrieval with V2's useful features
// Removed: Relationship Resolver (extra LLM call), Atomic validation (backwards logic)
// Kept: Session restore, Atomic storage, Mood assignment, Chat logging

window.hasRestoredSession = false;

// --- 1. INITIALIZE SESSION (ASYNC, NON-BLOCKING) ---
window.initializeSymbiosisSession = async function() {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    if (!appsScriptUrl || appsScriptUrl === "SKIP") return;

    try {
        console.log("🔄 Restoring Short-term Memory...");
        const req = await fetch(appsScriptUrl, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "get_recent_chat" })
        });
        const res = await req.json();
        
        if (res.history && Array.isArray(res.history)) {
            window.chatHistory = res.history.map(row => ({ 
                role: row[1], 
                content: row[2], 
                timestamp: row[0] 
            }));
            
            // Time Gap Logic
            if (window.chatHistory.length > 0) {
                const lastMsg = window.chatHistory[window.chatHistory.length - 1];
                const lastTime = new Date(lastMsg.timestamp).getTime();
                const now = new Date().getTime();
                const hoursDiff = (now - lastTime) / (1000 * 60 * 60);

                if (hoursDiff > 6) {
                    console.log(`🕒 Time Gap Detected: ${hoursDiff.toFixed(1)} hours`);
                    window.chatHistory.push({
                        role: "system",
                        content: `[SYSTEM_NOTE: The user has returned after ${Math.floor(hoursDiff)} hours. Treat this as a new session context, but retain previous memories.]`
                    });
                }
            }
            console.log("✅ Session Restored:", window.chatHistory.length, "msgs");
        }
    } catch (e) { console.error("Session Restore Failed", e); }
};

// --- MAIN PROCESS (OPTIMIZED) ---
window.processMemoryChat = async function(userText, apiKey, modelHigh, modelLow, history = [], isQuestionMode = false) {
    const appsScriptUrl = localStorage.getItem("symbiosis_apps_script_url");
    
    // Log User Input (Async, non-blocking)
    if (appsScriptUrl && appsScriptUrl !== "SKIP") {
        fetch(appsScriptUrl, { 
            method: "POST", 
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: "log_chat", role: "user", content: userText }) 
        }).catch(e => console.error("Log failed", e));
    }

    const historyText = history.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join("\n");
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    // --- STEP 1: SYNTHESIS (OPTIMIZED) ---
    // Combines entity extraction, keyword extraction, and fact detection in ONE call
    const synthPrompt = `
    USER_IDENTITY: Arvin, unless said otherwise
    CURRENT_DATE: ${today}
    CONTEXT:
    ${historyText}
    
    CURRENT INPUT: "${userText}"
    
    TASK:
    1. ENTITIES: Return a comma-separated list of ALL people/places involved.
       - Include the implied subject (e.g. if user says "me" or "I", write "Arvin").

    2. TOPICS: Broad categories (Identity, Preference, Location, Relationship, History, Work, Dream, Health).

    3. KEYWORDS: Extract 3-5 specific search terms from the input. Include synonyms.
       - If user asks "What is Arvin's MBTI?", keywords must be: "Arvin, MBTI"
       - If user asks "Where does Meidy work?", keywords must be: "Meidy, Work, Job, Office"
       - CRITICAL: This is used for database retrieval. Be specific.

    4. FACT: Extract NEW long-term info as a standalone declarative sentence.
       - Write in the third person.
       - CONVERT RELATIVE TIME TO ABSOLUTE DATES (YYYY or Month YYYY).
       - If user says "2 years ago", calculate the year based on CURRENT_DATE.
       - Do NOT use words like "currently", "recently", "ago", or "now".
       - Always write the time in the info unless it's a general fact.
       - If it is a QUESTION, CHIT-CHAT, or NO NEW INFO, return null.
    
    Return JSON only: { 
        "entities": "...", 
        "topics": "...", 
        "search_keywords": "...",  
        "new_fact": "..." (or null) 
    }
    `;

    console.log("🧠 1. Synthesizing Input..."); 

    let synthData = { entities: "", topics: "", search_keywords: "", new_fact: null };
    let retrievedContext = "";

    try {
        const synthReq = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${apiKey}`, 
                "Content-Type": "application/json", 
                "HTTP-Referer": window.location.href, 
                "X-Title": "Symbiosis" 
            },
            body: JSON.stringify({ "model": modelHigh, "messages": [{ "role": "system", "content": synthPrompt }] })
        });
        const synthRes = await synthReq.json();
        if (synthRes.choices) {
            const cleanRaw = synthRes.choices[0].message.content.replace(/```json/g, "").replace(/```/g, "");
            const fb = cleanRaw.indexOf('{'), lb = cleanRaw.lastIndexOf('}');
            const cleanJson = fb !== -1 && lb !== -1 ? cleanRaw.substring(fb, lb + 1) : cleanRaw;
            synthData = JSON.parse(cleanJson);
            console.log("🧠 AI DECISION:", synthData);
        }
    } catch (e) { 
        console.error("Synthesizer failed", e);
        synthData.search_keywords = userText.split(" ").filter(w => w.length > 3).join(", ");
    }

    // --- STEP 2: RETRIEVAL (V1 LOGIC - FAST & SIMPLE) ---
    let finalKeywords = synthData.search_keywords || userText;

    // Sticky Context: Add keywords from last AI message
    if (history.length > 0) {
        const lastAiMessage = history.filter(h => h.role === "assistant").pop();
        if (lastAiMessage) {
            const contextKeywords = lastAiMessage.content
                .split(" ")
                .filter(w => w.length > 4 && /^[a-zA-Z]+$/.test(w))
                .slice(0, 3)
                .join(", ");
            
            if (contextKeywords) {
                finalKeywords += ", " + contextKeywords;
                console.log("🔗 Sticky Context Added:", contextKeywords);
            }
        }
    }

    // Retrieve from Google Sheet
    if (appsScriptUrl && appsScriptUrl !== "SKIP" && (finalKeywords || userText.length > 3)) {
        console.log("🔍 2. Searching Google Sheet for:", finalKeywords); 

        try {
            const keywords = finalKeywords.split(',').map(s => s.trim());
            const memReq = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain" }, 
                body: JSON.stringify({ action: "retrieve", keywords: keywords })
            });

            const textRes = await memReq.text();
            let memRes;
            try {
                memRes = JSON.parse(textRes);
            } catch (err) {
                memRes = { memories: [] };
            }

            if(memRes.memories && memRes.memories.length > 0) {
                console.log("📂 Memories Found:", memRes.memories); 
                retrievedContext = "MEMORIES FOUND:\n" + memRes.memories.join("\n");
                window.lastRetrievedMemories = retrievedContext;
            } else {
                console.log("📂 No relevant memories found.");
            }
        } catch (e) { console.error("Memory Retrieval failed", e); }
    }

    // --- STEP 3: GENERATION (V2 ENHANCEMENT - MOOD ASSIGNMENT) ---
    let instructions = `
    You are Arvin's digital companion. 
    1. Answer accordingly. Never use bullet points. Never use tables. Just use pure text.
    2. Construct a KNOWLEDGE GRAPH (FOREST).
    `;

    // Question Mode Logic
    if (isQuestionMode) {
        instructions = `
    You are an inquisitive researcher helping Arvin document his life.
    YOU ARE IN 'INTERROGATION MODE'. 
    
    CRITICAL INSTRUCTION: READ THE HISTORY AND MEMORIES FIRST.
    1. Look at "MEMORIES FOUND" and "CONVERSATION HISTORY".
    2. BEFORE asking a question, check: "Did the user ALREADY answer this in the conversation?"
    3. If the answer exists (even partially), DO NOT ASK IT AGAIN. Move to the next logical follow-up.
    4. If the user just answered a question, acknowledge it briefly ("Understood.", "I see."), then ask a DIFFERENT deepening question.
    
    GOAL:
    - Dig for NEW information only.
    - If the user says "I told you", assume you missed it and ask for clarification on a *detail*, not the main fact.
    - Keep the graph simple (Roots = The Topic, Branches = What you are asking about).
    `;
    }

    const finalSystemPrompt = `
    ${instructions}
    ${retrievedContext}
    
    CONVERSATION HISTORY:
    ${historyText}
    
    User: "${userText}"
    
    STRUCTURE:
    - ROOTS: Array of MAX 3 objects (decide if the user needs more than 1). (Keep it simple).
    - ROOT LABEL: MUST be exactly 1 word. UPPERCASE. (e.g. "MUSIC", not "THE MUSIC I LIKE").
    - BRANCHES: Max 5 branches. Label MUST be exactly 1 word.
    - LEAVES: Max 5 leaves per branch. Text MUST be exactly 1 word.
    
    CRITICAL: DO NOT USE PHRASES. SINGLE WORDS ONLY.
    
    MOODS: [NEUTRAL, AFFECTIONATE, CRYPTIC, HATE, JOYFUL, CURIOUS, SAD, QUESTION]
    
    **IMPORTANT: Assign a specific MOOD to every ROOT and BRANCH based on sentiment:**
    - If the branch is "SPINACH" (which Arvin hates), mood must be "HATE".
    - If the branch is "MUSIC" (which Arvin likes), mood must be "JOYFUL".
    - If the branch is "FAMILY", mood might be "AFFECTIONATE".

    Return JSON: 
    { 
      "response": "...", 
      "mood": "GLOBAL_MOOD",
      "roots": [
         {
           "label": "ROOT_LABEL",
           "mood": "SPECIFIC_MOOD",
           "branches": [
              { 
                "label": "SUB_TOPIC", 
                "mood": "SPECIFIC_MOOD",
                "leaves": [ {"text":"DETAIL", "mood":"MOOD"} ] 
              }
           ]
         },
         { ...Optional 2nd Root... }
      ],
      "links": [
         { "source": "ROOT_LABEL_1", "target": "ROOT_LABEL_2" },
         { "source": "SUB_TOPIC_1", "target": "OTHER_LABEL" }
      ]
    }
    `;

    console.log("🎨 3. Generating Response...");
    
    try {
        const finalReq = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${apiKey}`, 
                "Content-Type": "application/json", 
                "HTTP-Referer": window.location.href, 
                "X-Title": "Symbiosis" 
            },
            body: JSON.stringify({ "model": modelHigh, "messages": [{ "role": "user", "content": finalSystemPrompt }] })
        });
        
        const responseData = await finalReq.json();
        
        // Clean response
        if (responseData.choices && responseData.choices[0]) {
            const raw = responseData.choices[0].message.content;
            const clean = raw.replace(/```json/g, "").replace(/```/g, "");
            const fb = clean.indexOf('{'), lb = clean.lastIndexOf('}');
            responseData.choices[0].message.content = fb !== -1 && lb !== -1 ? clean.substring(fb, lb + 1) : clean;
        }

        // --- STEP 4: ASYNC STORAGE (Fire and Forget) ---
        if (appsScriptUrl && appsScriptUrl !== "SKIP" && synthData.new_fact && synthData.new_fact !== "null") {
            fetch(appsScriptUrl, {
                method: "POST",
                mode: 'no-cors', 
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify({ 
                    action: "store", 
                    entities: synthData.entities, 
                    topics: synthData.topics, 
                    fact: synthData.new_fact 
                })
            }).catch(e => console.error("❌ Save failed", e));
        }

        // Log AI Response (Async)
        if(appsScriptUrl && appsScriptUrl !== "SKIP") {
            try {
                const parsed = JSON.parse(responseData.choices[0].message.content);
                fetch(appsScriptUrl, { 
                    method: "POST", 
                    headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify({ action: "log_chat", role: "assistant", content: parsed.response }) 
                }).catch(e=>{});
            } catch(e) {}
        }

        return responseData;

    } catch (error) {
        console.error("Generation failed", error);
        throw error;
    }
};
