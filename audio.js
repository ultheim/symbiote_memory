// ============================================
// AUDIO MODULE (audio.js) - ZEN SYNTHESIS
// ============================================

window.isSpeaking = false;
let audioCtx;
let masterGain = null;
let dynamicsCompressor = null;
let reverbNode = null;

// Source Nodes
let mainOsc = null;
let subOsc = null;
let filterNode = null;

// Musical Scale (Pentatonic Major - "The Happy Scale")
// F3, G3, A3, C4, D4, F4
const SCALE = [174.61, 196.00, 220.00, 261.63, 293.66, 349.23];

window.initAudio = function() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // 1. Dynamics Compressor (Safety)
    if (!dynamicsCompressor) {
        dynamicsCompressor = audioCtx.createDynamicsCompressor();
        dynamicsCompressor.threshold.value = -10;
        dynamicsCompressor.ratio.value = 12;
        dynamicsCompressor.connect(audioCtx.destination);
    }
}

// Helper to get a random note from the Happy Scale
function getMusicalPitch(char) {
    const index = (char.charCodeAt(0) + Math.floor(Math.random() * 3)) % SCALE.length;
    return SCALE[index];
}

window.startBreathStream = function() {
    if (window.isSpeaking) return;
    window.isSpeaking = true;
    const t = audioCtx.currentTime;

    // --- MASTER GAIN ---
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0, t);
    masterGain.gain.linearRampToValueAtTime(0.3, t + 0.5); 

    // --- SIMPLE REVERB (Fake Delay) ---
    const delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.15;
    const delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.3;
    
    masterGain.connect(dynamicsCompressor);
    masterGain.connect(delayNode);
    delayNode.connect(delayFeedback);
    delayFeedback.connect(delayNode);
    delayNode.connect(dynamicsCompressor);

    // --- OSCILLATORS ---
    mainOsc = audioCtx.createOscillator();
    mainOsc.type = 'triangle'; 
    mainOsc.frequency.value = 220; 

    subOsc = audioCtx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 220; 

    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 200; 
    filterNode.Q.value = 1; 

    mainOsc.connect(filterNode);
    subOsc.connect(filterNode);
    filterNode.connect(masterGain);

    mainOsc.start(t);
    subOsc.start(t);
}

window.stopBreathStream = function() {
    if (!window.isSpeaking || !masterGain) return;
    const t = audioCtx.currentTime;
    
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(0, t, 0.2); 

    setTimeout(() => { 
        if(mainOsc) { try{mainOsc.stop();}catch(e){} } 
        if(subOsc) { try{subOsc.stop();}catch(e){} } 
        window.isSpeaking = false; 
    }, 500);
}

window.morphMouthShape = function(char) {
    if (!mainOsc || !filterNode) return;
    const t = audioCtx.currentTime;
    const c = char.toUpperCase();
    
    const moodData = window.MOOD_AUDIO[window.glitchMode ? "GLITCH" : window.currentMood] || window.MOOD_AUDIO["NEUTRAL"];
    const speed = moodData.speed;

    let targetFreq = getMusicalPitch(c);
    targetFreq *= moodData.fShift;

    if (window.glitchMode) targetFreq += (Math.random() - 0.5) * 500;

    mainOsc.frequency.setTargetAtTime(targetFreq, t, 0.1 * speed);
    subOsc.frequency.setTargetAtTime(targetFreq / 2, t, 0.1 * speed); 

    let brightness = 400; 
    if ("AEIOU".includes(c)) brightness = 800; 
    if ("KPT".includes(c)) brightness = 1200;  
    
    if (window.glitchMode) brightness = 2000;

    filterNode.frequency.cancelScheduledValues(t);
    filterNode.frequency.setValueAtTime(filterNode.frequency.value, t);
    filterNode.frequency.linearRampToValueAtTime(brightness, t + (0.05 * speed)); 
    filterNode.frequency.setTargetAtTime(200, t + (0.1 * speed), 0.2 * speed); 
}