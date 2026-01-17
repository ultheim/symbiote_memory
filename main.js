// ============================================
// MAIN COORDINATOR (main.js) - OPTIMIZED
// ============================================

window.currentMood = "NEUTRAL";
window.glitchMode = false;
window.questionMode = false; 
window.textMode = false; // Toggle between AUDIO and TEXT mode
window.viewingHistory = false; // Flag for frozen history state

window.MOOD_AUDIO = {
    "NEUTRAL": { fShift: 1.0, speed: 1.0 },
    "AFFECTIONATE": { fShift: 0.8, speed: 1.3 }, 
    "CRYPTIC": { fShift: 0.9, speed: 1.0 },
    "HATE": { fShift: 1.5, speed: 0.6 },     
    "JOYFUL": { fShift: 1.2, speed: 0.9 },
    "CURIOUS": { fShift: 1.3, speed: 1.1 },
    "SAD": { fShift: 0.6, speed: 1.8 },
    "GLITCH": { fShift: 2.0, speed: 0.4 },
    "QUESTION": { fShift: 1.1, speed: 0.9 } 
};

window.PALETTES = {
    "NEUTRAL":     { pri: {r:255, g:255, b:255}, sec: {r:100, g:100, b:100}, conn: {r:80, g:80, b:80} },
    "AFFECTIONATE":{ pri: {r:255, g:50,  b:150}, sec: {r:150, g:20,  b:80},  conn: {r:100, g:0,  b:50} }, 
    "CRYPTIC":     { pri: {r:0,   g:255, b:150}, sec: {r:0,   g:100, b:60},  conn: {r:0,   g:80,  b:40} }, 
    "HATE":        { pri: {r:255, g:0,   b:0},   sec: {r:150, g:0,   b:0},   conn: {r:100, g:0,  b:0} }, 
    "JOYFUL":      { pri: {r:255, g:220, b:0},   sec: {r:180, g:150, b:0},  conn: {r:130, g:100, b:0} }, 
    "CURIOUS":     { pri: {r:0,   g:150, b:255}, sec: {r:0,   g:80,  b:180}, conn: {r:0,   g:60,  b:140} }, 
    "SAD":         { pri: {r:50,  g:50,  b:255}, sec: {r:20,  g:20,  b:150}, conn: {r:10,  g:10,  b:100} },
    "QUESTION":    { pri: {r:200, g:220, b:255}, sec: {r:20,  g:30,  b:80},  conn: {r:40,  g:50,  b:100} } 
};

let USER_API_KEY = localStorage.getItem("symbiosis_api_key") || "";
const MODEL_HIGH = "google/gemini-2.5-flash";      // For Conversation
const MODEL_LOW  = "google/gemini-2.5-flash-lite"; // For Extraction & Database 

// --- GLOBAL CHAT HISTORY ---
window.chatHistory = window.chatHistory || []; 

// --- TOGGLE MODES ---
window.toggleMode = function() {
    window.textMode = !window.textMode;
    const btn = document.getElementById('modeBtn');
    if (btn) btn.textContent = window.textMode ? "TEXT" : "AUDIO";
    window.speak("MODE SWITCHED.");
};

// --- TERMINAL HISTORY LOGIC ---
window.addToHistory = function(role, text, graphData = null) {
    const container = document.getElementById('terminal-content');
    if(!container) return; 
    const div = document.createElement('div');
    div.className = 'term-msg';
    
    const meta = document.createElement('div');
    meta.className = 'term-meta';
    meta.textContent = `[${new Date().toLocaleTimeString()}] // ${role.toUpperCase()}`;
    
    const content = document.createElement('div');
    content.className = role === 'user' ? 'term-user' : 'term-ai';
    content.textContent = text;

    // Make AI responses clickable if they have graph data
    if (role === 'ai' && graphData) {
        content.classList.add('interactive');
        content.title = "Click to restore Constellation";
        content.onclick = (e) => {
            e.stopPropagation(); // Prevent bubbling
            window.toggleHistory(); // Close the log panel
            window.restoreGraph(graphData); // Visuals function
            window.viewingHistory = true;
        };
    }
    
    div.appendChild(meta);
    div.appendChild(content);
    container.appendChild(div);
    
    const term = document.getElementById('terminal-history');
    if(term) term.scrollTop = term.scrollHeight;
}

window.toggleHistory = function() {
    const term = document.getElementById('terminal-history');
    if(!term) return;
    term.classList.toggle('hidden');
    const btn = document.getElementById('historyBtn');
    if(btn) btn.textContent = term.classList.contains('hidden') ? "LOG" : "EXIT";
}

// Global Dismiss for overlays
window.handleCanvasClick = function() {
    // If we are viewing a restored history graph OR the text box is open
    if (window.viewingHistory || !document.getElementById('full-text-display').classList.contains('hidden')) {
        window.triggerGraphDissolve();
        document.getElementById('full-text-display').classList.add('hidden');
        window.viewingHistory = false;
    }
};

window.triggerError = () => {
    window.currentMood = "WARNING";
    setTimeout(() => { window.currentMood = "NEUTRAL"; }, 3000);
};

window.checkAuth = function() {
    const ui = document.getElementById('ui-bar') || document.getElementById('ui-layer'); 
    const input = document.getElementById('wordInput');
    const btn = document.getElementById('sendBtn');
    
    const hasKey = !!localStorage.getItem("symbiosis_api_key");
    const hasSheet = !!localStorage.getItem("symbiosis_apps_script_url");

    if (!hasKey) {
        ui.classList.add('auth-mode');
        input.placeholder = "ENTER OPENROUTER KEY...";
        btn.textContent = "AUTH";
        return "KEY";
    } else if (!hasSheet) {
        ui.classList.add('auth-mode');
        input.placeholder = "OPTIONAL: ENTER GOOGLE SCRIPT URL...";
        btn.textContent = "LINK";
        return "SHEET";
    } else {
        ui.classList.remove('auth-mode');
        input.placeholder = window.questionMode ? "DISCUSS..." : "COMMUNICATE...";
        btn.textContent = "SYNC";
        return "READY";
    }
}

window.saveConfig = function(val, type) {
    if(type === "KEY") {
        if(val.length < 10 || !val.startsWith("sk-")) { window.speak("INVALID KEY FORMAT."); return; }
        localStorage.setItem("symbiosis_api_key", val.trim());
        USER_API_KEY = val.trim();
        window.speak("KEY ACCEPTED.");
    } else if(type === "SHEET") {
        if(val === "SKIP") {
            localStorage.setItem("symbiosis_apps_script_url", "SKIP");
            window.speak("MEMORY DISABLED.");
        } else {
            localStorage.setItem("symbiosis_apps_script_url", val.trim());
            window.speak("MEMORY LINKED.");
        }
    }
    window.checkAuth();
}

async function handleChat(userText) {
    if(!USER_API_KEY) return;
    const btn = document.getElementById('sendBtn');
    btn.textContent = "SYNCING..."; btn.disabled = true;

    window.isThinking = true;

    // Use Global Chat History
    window.chatHistory.push({ role: "user", content: userText });
    window.addToHistory("user", userText);
    
    // Keep local buffer manageable
    if (window.chatHistory.length > 10) window.chatHistory = window.chatHistory.slice(-10);

    try {
        const data = await window.processMemoryChat(userText, USER_API_KEY, MODEL_HIGH, MODEL_LOW, window.chatHistory, window.questionMode);
        
        if (!data || !data.choices || !data.choices[0]) {
            console.error("API Error Response:", data);
            throw new Error("Invalid API Response");
        }

        let rawText = data.choices[0].message.content;
        
        const cleanRaw = rawText.replace(/```json/g, "").replace(/```/g, "");
        const firstBrace = cleanRaw.indexOf('{'), lastBrace = cleanRaw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
             rawText = cleanRaw.substring(firstBrace, lastBrace + 1);
        }
        
        const json = JSON.parse(rawText);

        window.chatHistory.push({ role: "assistant", content: json.response });
        // Pass the json graph data to history so it can be clicked later
        window.addToHistory("ai", json.response, json);

        // --- GRAPH BUILDING ---
        if (json.roots && Array.isArray(json.roots)) {
            let flatKeywords = [];
            json.roots.forEach(root => {
                flatKeywords.push(root.label);
                if (root.branches && Array.isArray(root.branches)) {
                    root.branches.forEach(b => {
                        flatKeywords.push(b.label || b.text);
                        if (b.leaves && Array.isArray(b.leaves)) {
                            b.leaves.forEach(leaf => {
                                const leafText = typeof leaf === 'object' ? leaf.text : leaf;
                                flatKeywords.push(leafText);
                            });
                        }
                    });
                }
            });

            window.updateKeywords(flatKeywords.filter(k => k).map(k => String(k).toUpperCase()));

            if (window.buildKnowledgeGraph && window.globalBoidsArray) {
                window.buildKnowledgeGraph(json, window.globalBoidsArray);
            }
        }
        else if (json.keywords && Array.isArray(json.keywords)) {
             window.updateKeywords(json.keywords);
             const fakeGraph = {
                 roots: [{
                     label: json.keywords[0],
                     branches: json.keywords.slice(1).map(k => ({ label: k, leaves: [] }))
                 }]
             };
             window.buildKnowledgeGraph(fakeGraph, window.globalBoidsArray);
        }

        // --- MOOD UPDATE ---
        if(window.questionMode) {
            window.currentMood = "QUESTION";
        } else {
            // Normalize mood to uppercase before checking
            const rawMood = json.mood ? String(json.mood).toUpperCase() : "NEUTRAL";
            
            if(window.MOOD_AUDIO[rawMood]) {
                window.currentMood = rawMood;
            } else {
                console.warn("Unknown Mood returned:", json.mood, "Defaulting to NEUTRAL");
                window.currentMood = "NEUTRAL";
            }
        }

        window.isThinking = false;

        // --- OUTPUT HANDLING (AUDIO VS TEXT MODE) ---
        let watchdog = 0;
        const checkEating = setInterval(() => {
            watchdog += 50;
            if ((window.feedingActive === false || document.querySelectorAll('.char-span').length === 0) || watchdog > 3000) { 
                clearInterval(checkEating);      
                
                if (window.textMode) {
                    // TEXT MODE: Show full box, skip audio, keep graph alive
                    const textDisplay = document.getElementById('full-text-display');
                    const textContent = document.getElementById('text-content');
                    if (textDisplay && textContent) {
                        textContent.textContent = json.response;
                        textDisplay.classList.remove('hidden');
                        // Ensure graph stays until clicked
                        window.viewingHistory = true; 
                    }
                } else {
                    // AUDIO MODE: Stream subtitles
                    window.speak(json.response);     
                }
            }
        }, 50); 

    } catch (error) {
        console.error("CHAT ERROR:", error); 
        window.triggerError();
        window.isThinking = false;
        window.speak("SYSTEM FAILURE.");
    } finally { btn.textContent = "SYNC"; btn.disabled = false; }
}

window.handleInput = function() {
    const input = document.getElementById('wordInput');
    const text = input.value.trim();
    if(!text) return;

    if(window.initAudio) window.initAudio();

    const authState = window.checkAuth();
    if (authState === "KEY") { window.saveConfig(text, "KEY"); input.value = ""; return; }
    if (authState === "SHEET") { window.saveConfig(text, "SHEET"); input.value = ""; return; }

    if (text.toLowerCase() === "question time") {
        window.questionMode = true;
        window.currentMood = "QUESTION";
        window.speak("MODE: INTERROGATION. WHAT SHALL WE DISCUSS?");
        input.value = ""; 
        input.placeholder = "DISCUSS...";
        input.blur();
        return;
    }
    
    if (text.toLowerCase() === "done" && window.questionMode) {
        window.questionMode = false;
        window.currentMood = "NEUTRAL";
        window.speak("RETURNING TO HOMEOSTASIS.");
        input.value = ""; 
        input.placeholder = "COMMUNICATE...";
        input.blur();
        return;
    }

    // Dismiss any open overlays when new input comes
    window.handleCanvasClick();

    const isGarbage = text.length > 6 && (!/[aeiouAEIOU]/.test(text) || /(.)\1{3,}/.test(text));
    
    if(isGarbage) {
        window.glitchMode = true;
        window.currentMood = "GLITCH";
        window.spawnFoodText(text);
        setTimeout(() => {
            window.speak("ERR.. SYST3M... REJECT... D4TA..."); 
            setTimeout(() => { window.glitchMode = false; window.currentMood = "NEUTRAL"; }, 2000);
        }, 2000);
    } else {
        window.spawnFoodText(text);
        if(text.startsWith('/')) {
            setTimeout(() => window.speak(text.substring(1)), 1500);
        } else {
            handleChat(text);
        }
    }
    input.value = ""; input.blur(); 
}

window.onload = () => { 
    if(window.initSymbiosisAnimation) window.initSymbiosisAnimation(); 
    window.checkAuth(); 
    const input = document.getElementById('wordInput');
    if(input) input.addEventListener('keypress',e=>{if(e.key==='Enter')window.handleInput()});

    // Initialize session restore (async, non-blocking)
    if(window.initializeSymbiosisSession) window.initializeSymbiosisSession();
};
