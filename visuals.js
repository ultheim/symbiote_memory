// ============================================
// VISUALS MODULE (visuals.js) - MULTI-ROOT GRAPH
// ============================================

let foodParticles = [];
// activeGraphBoids stores: { boid, text, level, opacity, dying, deathTimer, parents: [], localMoodColor, mood }
let activeGraphBoids = []; 
window.feedingActive = false;
let eatenFoodCount = 0;
let totalFoodCount = 0;
let digestionGlow = 0; 
let graphModeActive = false;
window.isThinking = false;
// Note: window.questionMode is defined in main.js

// Default Palette (Champagne & Taupe)
window.curPalette = { 
    pri: {r:240, g:230, b:210}, 
    sec: {r:180, g:170, b:155}, 
    conn: {r:120, g:115, b:110} 
};

let indicesList=["SYSTEM", "LOCKED", "SECURE", "AUTH", "REQUIRED", "WAIT", "KEY", "VOID"];
window.updateKeywords = (newList) => {
    if(newList && newList.length > 0) indicesList = newList;
};

// --- FLUID DYNAMICS ---
const PHYSICS = {
    MAX_FORCE: 0.03,    // Gentler steering
    MAX_SPEED: 6.0,     // Slower cruise speed
    VISION_RAD: 120,    
    SEPARATION: 30,     
    ALIGN_WEIGHT: 1.5,  
    COHESION_WEIGHT: 0.8,
    SEPARATION_WEIGHT: 2.0, // Less aggressive pushing
    WAVE_INTENSITY: 0,
    NUCLEUS_GRAVITY: 0.005
};

const FLOCK_SIZE = 1200;
const MAX_FLOCK = 1600;

class Boid {
    constructor(x, y, z, isNewborn = false, burstVel = null) {
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * 300;
        this.pos = { 
            x: x || Math.cos(angle) * rad, 
            y: y || Math.sin(angle) * rad, 
            z: z || (Math.random()-0.5) * 150 
        };
        
        if (burstVel) {
            this.vel = { x: burstVel.x, y: burstVel.y, z: (Math.random()-0.5)*5 };
            this.acc = { x: burstVel.x*0.5, y: burstVel.y*0.5, z: 0 };
        } else {
            const vx = (Math.random()-0.5);
            const vy = (Math.random()-0.5);
            const mag = Math.sqrt(vx*vx + vy*vy);
            this.vel = { 
                x: (vx/mag) * PHYSICS.MAX_SPEED, 
                y: (vy/mag) * PHYSICS.MAX_SPEED, 
                z: (Math.random()-0.5) * 2 
            };
            this.acc = { x: 0, y: 0, z: 0 };
        }
        this.type = isNewborn ? 'sec' : (Math.random() > 0.6 ? 'pri' : 'sec');
        this.bornTime = isNewborn ? 1.0 : 0.0;
        this.fear = 0; 
        
        this.nodeData = null; 
        // Localized Color State for individual boids
        this.color = { ...window.curPalette.sec };
        this.targetColor = { ...window.curPalette.sec };
        
        // Random offset for blinking animation in Night Sky mode
        this.blinkOffset = Math.random() * Math.PI * 2;
        this.blinkSpeed = 0.5 + Math.random() * 1.5;
        
        // For diamond rendering rotation
        this.rotPhase = Math.random() * Math.PI;
    }

    steer(target, slowDown = false) {
        let steer = {x:0, y:0, z:0};
        let desired = { x: target.x - this.pos.x, y: target.y - this.pos.y, z: target.z - this.pos.z };
        let d = Math.sqrt(desired.x**2 + desired.y**2 + desired.z**2);
        if (d > 0) {
            desired.x /= d; desired.y /= d; desired.z /= d;
            if (slowDown && d < 100) {
                let m = (d/100) * PHYSICS.MAX_SPEED;
                desired.x *= m; desired.y *= m; desired.z *= m;
            } else {
                desired.x *= PHYSICS.MAX_SPEED; desired.y *= PHYSICS.MAX_SPEED; desired.z *= PHYSICS.MAX_SPEED;
            }
            steer.x = desired.x - this.vel.x; steer.y = desired.y - this.vel.y; steer.z = desired.z - this.vel.z;
            this.limitForce(steer);
        }
        return steer;
    }

    limitForce(vector) {
        let magSq = vector.x**2 + vector.y**2 + vector.z**2;
        if (magSq > PHYSICS.MAX_FORCE**2) {
            let mag = Math.sqrt(magSq);
            vector.x = (vector.x/mag) * PHYSICS.MAX_FORCE;
            vector.y = (vector.y/mag) * PHYSICS.MAX_FORCE;
            vector.z = (vector.z/mag) * PHYSICS.MAX_FORCE;
        }
    }

    applyForce(force) {
        this.acc.x += force.x; this.acc.y += force.y; this.acc.z += force.z;
    }

    update(boids, mouse, width, height, time) {
        // --- 0. QUESTION MODE: NIGHT SKY PHYSICS ---
        if (window.questionMode && !this.nodeData) {
            // Halt velocity significantly to create a "static" star field
            this.vel.x *= 0.92;
            this.vel.y *= 0.92;
            this.vel.z *= 0.92;
            
            // Minimal drift
            this.pos.x += Math.sin(time * 0.5 + this.blinkOffset) * 0.1;
            this.pos.y += Math.cos(time * 0.5 + this.blinkOffset) * 0.1;

            // Blinking Effect Logic (visuals applied in animate loop via targetColor)
            let brightness = Math.sin(time * this.blinkSpeed + this.blinkOffset); 
            // Map sine -1..1 to range 50..255 for color
            let val = 150 + (brightness * 100); 
            this.targetColor = { r: val, g: val, b: 255 }; // Bluish white stars
            
            // Lerp to blink color
            this.color.r += (this.targetColor.r - this.color.r) * 0.1;
            this.color.g += (this.targetColor.g - this.color.g) * 0.1;
            this.color.b += (this.targetColor.b - this.color.b) * 0.1;

            return; // Skip standard flocking logic
        }

        // --- 1. ELEGANT HIERARCHICAL OVERRIDE ---
        if (this.nodeData && !this.nodeData.dying) {
            let targetPos = { x: 0, y: 0, z: 0 };
            let followStrength = 0.08; 

            if (this.nodeData.level === 1) {
                // UPDATE: Level 1 nodes now have individual target positions (Multi-root support)
                targetPos = this.nodeData.fixedPos || { x: 0, y: 0, z: 0 };
                followStrength = 0.12;
            } else if (this.nodeData.level === 2 && this.nodeData.parents[0]) {
                // UPDATE: Level 2 nodes now orbit their specific PARENT, not (0,0)
                let parent = this.nodeData.parents[0];
                let angle = (this.nodeData.index * 1.5) + (time * 0.08);
                // Orbit radius 320 around the parent
                targetPos.x = parent.pos.x + Math.cos(angle) * 320; 
                targetPos.y = parent.pos.y + Math.sin(angle) * 320;
                this.vel.x *= 0.95; this.vel.y *= 0.95;
            } else if (this.nodeData.level === 3 && this.nodeData.parents[0]) {
                // Level 3 Nodes orbit their Level 2 Parent
                let parent = this.nodeData.parents[0];
                let angle = this.nodeData.index + (time * 0.12);
                let r = this.nodeData.staggerRadius || 180;
                targetPos.x = parent.pos.x + Math.cos(angle) * r;
                targetPos.y = parent.pos.y + Math.sin(angle) * r;
                this.vel.x *= 0.9; this.vel.y *= 0.9;
            }

            // Lerp position for silk-smooth movement
            this.pos.x += (targetPos.x - this.pos.x) * followStrength;
            this.pos.y += (targetPos.y - this.pos.y) * followStrength;
            
            // Fast color lerp for "Glowing" nodes
            this.color.r += (this.nodeData.localMoodColor.r - this.color.r) * 0.15;
            this.color.g += (this.nodeData.localMoodColor.g - this.color.g) * 0.15;
            this.color.b += (this.nodeData.localMoodColor.b - this.color.b) * 0.15;
            return; 
        }

        let sep = {x:0, y:0, z:0};
        let ali = {x:0, y:0, z:0};
        let coh = {x:0, y:0, z:0};
        let count = 0;

        // --- 2. GENTLE STARLING MURMURATION (INTENSITY-BASED) ---
        let bestNode = null;
        let minWeightedDist = Infinity;

        activeGraphBoids.forEach(gb => {
            // NEW: Ignore Level 1 nodes for attraction logic (prevents clumping at roots)
            if (!gb.nodeData || gb.nodeData.dying || gb.nodeData.level === 1) return;
            
            let d = Math.sqrt((this.pos.x - gb.pos.x)**2 + (this.pos.y - gb.pos.y)**2);
            let weightedDist = d / Math.pow(gb.nodeData.weight, 1.5); 
            if (weightedDist < minWeightedDist) {
                minWeightedDist = weightedDist;
                bestNode = gb;
            }
        });

        if (bestNode) {
            let dx = bestNode.pos.x - this.pos.x;
            let dy = bestNode.pos.y - this.pos.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            let pullRad = 300 * bestNode.nodeData.weight;

            if (dist < pullRad) {
                // ELEGANT STEERING: Glide instead of Snap
                let ease = Math.pow(1 - dist/pullRad, 2);
                let speedLimit = PHYSICS.MAX_SPEED * 0.4;
                
                // Calculate desired velocity toward the node
                let desiredX = (dx / dist) * speedLimit;
                let desiredY = (dy / dist) * speedLimit;

                // GENTLE FLUTTER: Slower, more organic waves
                let noiseFreq = time * 1.5;
                let flutterX = Math.sin(noiseFreq + this.pos.y * 0.01) * 0.8;
                let flutterY = Math.cos(noiseFreq + this.pos.x * 0.01) * 0.8;

                // Apply force with high damping (0.01 is very gentle)
                this.applyForce({ 
                    x: (desiredX - this.vel.x + flutterX) * 0.012 * ease * bestNode.nodeData.weight,
                    y: (desiredY - this.vel.y + flutterY) * 0.012 * ease * bestNode.nodeData.weight,
                    z: (Math.random() - 0.5) * 0.05
                });

                // MURMURATION DRAG: Slows down particles as they get closer to the topic
                this.vel.x *= 0.985;
                this.vel.y *= 0.985;

                // Soft separation to maintain "Elegant Cloud" volume
                if (dist < 60) {
                    let repulse = (1 - dist/60) * 0.05;
                    this.applyForce({ x: -dx * repulse, y: -dy * repulse, z: 0 });
                }

                this.targetColor = bestNode.nodeData.localMoodColor;
            }
        }

        if (!this.targetColor) {
            this.targetColor = this.type === 'pri' ? window.curPalette.pri : window.curPalette.sec;
        }

        this.color.r += (this.targetColor.r - this.color.r) * 0.05;
        this.color.g += (this.targetColor.g - this.color.g) * 0.05;
        this.color.b += (this.targetColor.b - this.color.b) * 0.05;

        const stride = boids.length > 400 ? 2 : 1;

        for(let i=0; i<boids.length; i+=stride) {
            let other = boids[i];
            if(other === this) continue;
            let dx = this.pos.x - other.pos.x;
            let dy = this.pos.y - other.pos.y;
            let dz = this.pos.z - other.pos.z;
            let dSq = dx*dx + dy*dy + dz*dz;

            if(dSq < PHYSICS.VISION_RAD**2) {
                ali.x += other.vel.x; ali.y += other.vel.y; ali.z += other.vel.z;
                coh.x += other.pos.x; coh.y += other.pos.y; coh.z += other.pos.z;
                if(dSq < PHYSICS.SEPARATION**2) {
                    let d = Math.sqrt(dSq);
                    let diff = { x: dx/d, y: dy/d, z: dz/d };
                    sep.x += diff.x; sep.y += diff.y; sep.z += diff.z;
                }
                count++;
            }
        }

        if(count > 0) {
            ali.x /= count; ali.y /= count; ali.z /= count;
            let aliMag = Math.sqrt(ali.x**2 + ali.y**2 + ali.z**2) || 1;
            ali.x = (ali.x/aliMag) * PHYSICS.MAX_SPEED;
            ali.y = (ali.y/aliMag) * PHYSICS.MAX_SPEED;
            ali.z = (ali.z/aliMag) * PHYSICS.MAX_SPEED;
            let steerAli = { x: ali.x - this.vel.x, y: ali.y - this.vel.y, z: ali.z - this.vel.z };
            this.limitForce(steerAli);

            coh.x /= count; coh.y /= count; coh.z /= count;
            let steerCoh = this.steer(coh, false);

            let sepMag = Math.sqrt(sep.x**2 + sep.y**2 + sep.z**2) || 1;
            sep.x = (sep.x/sepMag) * PHYSICS.MAX_SPEED; 
            sep.y = (sep.y/sepMag) * PHYSICS.MAX_SPEED;
            sep.z = (sep.z/sepMag) * PHYSICS.MAX_SPEED;
            let steerSep = { x: sep.x - this.vel.x, y: sep.y - this.vel.y, z: sep.z - this.vel.z };
            this.limitForce(steerSep);

            this.applyForce({ x: steerAli.x * PHYSICS.ALIGN_WEIGHT, y: steerAli.y * PHYSICS.ALIGN_WEIGHT, z: steerAli.z * PHYSICS.ALIGN_WEIGHT });
            this.applyForce({ x: steerSep.x * PHYSICS.SEPARATION_WEIGHT, y: steerSep.y * PHYSICS.SEPARATION_WEIGHT, z: steerSep.z * PHYSICS.SEPARATION_WEIGHT });
            this.applyForce({ x: steerCoh.x * PHYSICS.COHESION_WEIGHT, y: steerCoh.y * PHYSICS.COHESION_WEIGHT, z: steerCoh.z * PHYSICS.COHESION_WEIGHT });
        }

        if (PHYSICS.WAVE_INTENSITY > 0) {
            let waveFreq = 0.05;
            let flowX = Math.sin(this.pos.y * waveFreq + time * 10); 
            let flowY = Math.cos(this.pos.x * waveFreq + time * 8);
            this.applyForce({
                x: flowX * PHYSICS.WAVE_INTENSITY * 0.1,
                y: flowY * PHYSICS.WAVE_INTENSITY * 0.1,
                z: 0
            });
        }

        if (window.isThinking) {
            let daX = -this.pos.y;
            let daY = this.pos.x;
            let daMag = Math.sqrt(daX*daX + daY*daY);
            if(daMag > 1) {
                daX /= daMag; daY /= daMag;
                this.applyForce({ x: daX * 0.03, y: daY * 0.03, z: 0 });
            }
        }

        if(mouse.active) {
            // Predict where the mouse will be in 3 frames
            let predFutureX = mouse.x + (mouse.vx * 3);
            let predFutureY = mouse.y + (mouse.vy * 3);
            let dx = this.pos.x - predFutureX;
            let dy = this.pos.y - predFutureY;
            let dSq = dx*dx + dy*dy;
            
            // Radius expands based on mouse speed
            let fearRad = 200 + Math.min(Math.abs(mouse.vx)*5, 100);
            
            if(dSq < fearRad**2) {
                let force = (fearRad*fearRad) / (dSq || 1); 
                force = Math.min(force, 5.0); 
                let fleeX = dx; let fleeY = dy;
                let mag = Math.sqrt(fleeX**2 + fleeY**2);
                fleeX /= mag; fleeY /= mag;
                this.applyForce({x: fleeX*force*0.8, y: fleeY*force*0.8, z: 0});
                this.fear = 1.0;
            }
        }

        // --- DYNAMIC 3D SCREEN-SPACE BOUNDARIES ---
        const distFromCenter = Math.sqrt(this.pos.x**2 + this.pos.y**2);
        const safeZone = width * 0.55; 
        if (distFromCenter > safeZone) {
            let desired = { x: -this.pos.x, y: -this.pos.y, z: -this.pos.z };
            let mag = Math.sqrt(desired.x**2 + desired.y**2 + desired.z**2);
            desired.x = (desired.x/mag) * PHYSICS.MAX_SPEED;
            desired.y = (desired.y/mag) * PHYSICS.MAX_SPEED;
            desired.z = (desired.z/mag) * PHYSICS.MAX_SPEED;
            let steer = { x: (desired.x - this.vel.x) * 0.05, y: (desired.y - this.vel.y) * 0.05, z: (desired.z - this.vel.z) * 0.05 };
            this.applyForce(steer);
        }

        // Z-AXIS CONTROL: Prevent camera clipping or flying too deep
        if(this.pos.z < -250) this.applyForce({x:0, y:0, z:0.1});
        if(this.pos.z > 250) this.applyForce({x:0, y:0, z:-0.1});

        // --- VELOCITY & POSITION INTEGRATION ---
        this.vel.x += this.acc.x; 
        this.vel.y += this.acc.y; 
        this.vel.z += this.acc.z;

        let speed = Math.sqrt(this.vel.x**2 + this.vel.y**2 + this.vel.z**2);
        if(speed > PHYSICS.MAX_SPEED) {
            let ratio = PHYSICS.MAX_SPEED / speed;
            this.vel.x *= ratio; 
            this.vel.y *= ratio; 
            this.vel.z *= ratio;
        }

        this.pos.x += this.vel.x; 
        this.pos.y += this.vel.y; 
        this.pos.z += this.vel.z;
        this.acc = {x:0, y:0, z:0};
        
        if(this.bornTime > 0) this.bornTime -= 0.02;
        if(this.fear > 0) this.fear -= 0.05;
    }
}

// --- UPDATED LEGEND LOGIC ---
window.updateMoodLegend = () => {
    const legendContainer = document.getElementById('mood-legend');
    if (!legendContainer) return;

    // Reset logic
    if (activeGraphBoids.length === 0) {
        legendContainer.innerHTML = '';
        return;
    }

    const counts = {};
    let totalNodes = 0;

    activeGraphBoids.forEach(b => {
        if (!b.nodeData || b.nodeData.dying) return;
        const mood = b.nodeData.mood || "NEUTRAL";
        counts[mood] = (counts[mood] || 0) + 1;
        totalNodes++;
    });

    if (totalNodes === 0) {
        legendContainer.innerHTML = '';
        return;
    }

    // Convert to sorted array
    const sortedMoods = Object.keys(counts).map(key => {
        return { mood: key, count: counts[key], pct: (counts[key] / totalNodes) * 100 };
    }).sort((a, b) => b.pct - a.pct);

    let html = '';
    sortedMoods.forEach(item => {
        // Use global palette for legend dot, fallback to white
        let colorObj = (window.PALETTES && window.PALETTES[item.mood]) ? window.PALETTES[item.mood].pri : {r:255, g:255, b:255};
        const colorCss = `rgb(${colorObj.r}, ${colorObj.g}, ${colorObj.b})`;

        html += `
            <div class="legend-item">
                <span class="legend-text">${item.mood}</span>
                <span style="color:${colorCss}">${Math.round(item.pct)}%</span>
                <div class="legend-dot" style="background-color: ${colorCss}; box-shadow: 0 0 6px ${colorCss};"></div>
            </div>
        `;
    });

    legendContainer.innerHTML = html;
};

// --- RESTORE GRAPH FUNCTION (NEW) ---
window.restoreGraph = (graphData) => {
    // 1. Clear existing graph cleanly
    activeGraphBoids.forEach(b => { 
        if(b.nodeData) b.nodeData = null; 
    });
    activeGraphBoids = [];

    // 2. Restore mood
    if (graphData.mood) {
        window.currentMood = graphData.mood;
    } else {
        window.currentMood = "NEUTRAL";
    }

    // 3. Rebuild
    window.buildKnowledgeGraph(graphData, window.globalBoidsArray);
};

// --- UPDATED GRAPH BUILDER: MULTI-ROOT + DEDUPLICATION ---
window.buildKnowledgeGraph = (graphData, boidsArray) => {
    graphModeActive = true;
    activeGraphBoids = []; 
    
    if (!boidsArray || boidsArray.length < 50) return;
    if (!graphData.roots || !Array.isArray(graphData.roots)) return;

    const getBoid = () => {
        let attempts = 0;
        let b;
        do {
            b = boidsArray[Math.floor(Math.random() * boidsArray.length)];
            attempts++;
        } while (b.nodeData !== null && attempts < 100);
        return b;
    };

    const getMoodColor = (mood) => {
        const p = window.PALETTES[mood] || window.PALETTES["NEUTRAL"];
        return {
            r: p.pri.r + (Math.random()-0.5)*20,
            g: p.pri.g + (Math.random()-0.5)*20,
            b: p.pri.b + (Math.random()-0.5)*20
        };
    };

    const createNode = (data, level, parents, inheritedMood, index, fixedPos = null) => {
        const text = typeof data === 'object' ? data.text : data;
        const mood = typeof data === 'object' && data.mood ? data.mood : (inheritedMood || "NEUTRAL");
        
        // --- UPDATED: Use window.chatHistory ---
        const historyText = (window.chatHistory || []).map(h => h.content).join(" ");
        const sheetText = window.lastRetrievedMemories || "";
        const combinedContext = (historyText + " " + sheetText).toLowerCase();
        
        const keyword = String(text).toLowerCase();
        const occurrences = combinedContext.split(keyword).length - 1;
        const weight = Math.max(1, Math.log2(occurrences + 2)); 
        
        return {
            text: String(text).toUpperCase(),
            level: level,
            index: index,
            weight: weight, 
            parents: parents, // Array of boids
            opacity: 0,
            dying: false,
            deathTimer: 0,
            localMoodColor: getMoodColor(mood),
            mood: mood,
            fixedPos: fixedPos 
        };
    };

    // Dictionary to map UPPERCASE Label -> Boid (for linking & deduplication)
    const nodeMap = {}; 
    const globalMood = graphData.mood || window.currentMood;

    // 1. DISTRIBUTE ROOTS
    const rootCount = graphData.roots.length;
    const rootRadius = rootCount > 1 ? 350 : 0; 
    
    graphData.roots.forEach((root, rIdx) => {
        const rootLabel = root.label || "UNKNOWN";
        const rootKey = rootLabel.toUpperCase();
        const rootMood = root.mood || globalMood;
        
        let rootBoid;

        // CHECK IF EXISTS
        if(nodeMap[rootKey]) {
            rootBoid = nodeMap[rootKey];
            // Reuse existing, perhaps update mood or weight if needed, but primary structure stays.
        } else {
            // CREATE NEW
            rootBoid = getBoid();
            let rootPos = { x: 0, y: 0, z: 0 };
            if (rootCount > 1) {
                const angle = (rIdx / rootCount) * Math.PI * 2;
                rootPos.x = Math.cos(angle) * rootRadius;
                rootPos.y = Math.sin(angle) * rootRadius;
            }
            rootBoid.nodeData = createNode(rootLabel, 1, [], rootMood, 0, rootPos);
            activeGraphBoids.push(rootBoid);
            nodeMap[rootKey] = rootBoid;
        }

        if (root.branches && Array.isArray(root.branches)) {
            root.branches.forEach((branch, bIdx) => {
                const branchText = branch.label || branch.text;
                const branchKey = String(branchText).toUpperCase();
                const branchMood = branch.mood || rootMood; 
                
                let boidL2;

                // CHECK IF EXISTS (DEDUPLICATION)
                if(nodeMap[branchKey]) {
                    boidL2 = nodeMap[branchKey];
                    // Link existing node to this NEW root as well
                    if (!boidL2.nodeData.parents.includes(rootBoid)) {
                        boidL2.nodeData.parents.push(rootBoid);
                    }
                } else {
                    // CREATE NEW
                    boidL2 = getBoid();
                    const branchAngleIndex = (bIdx / root.branches.length) * Math.PI * 2;
                    boidL2.nodeData = createNode(branchText, 2, [rootBoid], branchMood, branchAngleIndex);
                    activeGraphBoids.push(boidL2);
                    nodeMap[branchKey] = boidL2;
                }

                if (branch.leaves && Array.isArray(branch.leaves)) {
                    branch.leaves.forEach((leafData, lIdx) => {
                        const leafText = typeof leafData === 'object' ? leafData.text : leafData;
                        const leafKey = String(leafText).toUpperCase();
                        
                        let boidL3;

                        // CHECK IF EXISTS (DEDUPLICATION)
                        if (nodeMap[leafKey]) {
                            boidL3 = nodeMap[leafKey];
                            // Link existing leaf to this NEW branch parent
                            if(!boidL3.nodeData.parents.includes(boidL2)) {
                                boidL3.nodeData.parents.push(boidL2);
                            }
                        } else {
                            // CREATE NEW
                            boidL3 = getBoid();
                            const staggerRadius = lIdx % 2 === 0 ? 150 : 220;
                            const leafAngleIndex = (lIdx / branch.leaves.length) * Math.PI * 2 + (bIdx * 0.5);
                            boidL3.nodeData = createNode(leafData, 3, [boidL2], branchMood, leafAngleIndex);
                            boidL3.nodeData.staggerRadius = staggerRadius; 
                            activeGraphBoids.push(boidL3);
                            nodeMap[leafKey] = boidL3;
                        }
                    });
                }
            });
        }
    });

    // 2. PROCESS CROSS-LINKS (Explicit links from LLM)
    if (graphData.links && Array.isArray(graphData.links)) {
        graphData.links.forEach(link => {
            const sourceBoid = nodeMap[String(link.source).toUpperCase()];
            const targetBoid = nodeMap[String(link.target).toUpperCase()];
            
            if (sourceBoid && targetBoid) {
                if (!sourceBoid.nodeData.parents.includes(targetBoid)) {
                    sourceBoid.nodeData.parents.push(targetBoid);
                }
            }
        });
    }

    digestionGlow = 1.0; 
    window.updateMoodLegend();
};

window.triggerGraphDissolve = () => {
    activeGraphBoids.forEach(b => {
        if(!b.nodeData) return;
        b.nodeData.dying = true;
        if(b.nodeData.level === 3) b.nodeData.deathTimer = Math.random() * 40;
        else if(b.nodeData.level === 2) b.nodeData.deathTimer = 40 + Math.random() * 50;
        else b.nodeData.deathTimer = 100 + Math.random() * 40; 
    });
    
    // Clear legend when graph dissolves
    const legendContainer = document.getElementById('mood-legend');
    if (legendContainer) legendContainer.innerHTML = '';
};

window.spawnFoodText = (text) => {
    foodParticles = [];
    eatenFoodCount = 0;
    const chars = text.split('');
    totalFoodCount = chars.length;
    window.feedingActive = true;
    
    const w = window.canvasLogicalWidth || window.innerWidth;
    const h = window.canvasLogicalHeight || window.innerHeight;

    const startY = h * 0.5 + 100; 
    const spread = Math.min(w * 0.8, chars.length * 50); 
    const startX = -spread / 2; 

    chars.forEach((char, i) => {
        foodParticles.push({
            char: char,
            x: startX + (i * (spread / chars.length)) + (Math.random()-0.5)*40, 
            y: startY + (Math.random() * 100),
            vx: (Math.random() - 0.5) * 1.5,  
            vy: -4 - Math.random() * 3, 
            offset: Math.random() * 100,
            scale: 1.0, 
            active: true
        });
    });
};

window.activeWordMode = false;
let globalAtmosphereMod = { speed: 1.0, sep: 0, align: 0, wave: 0 };
window.currentIntensity = 0; 

window.speak = function(text) {
    window.feedingActive = false; eatenFoodCount = 0; totalFoodCount = 0;
    window.initAudio(); 
    window.startBreathStream();
    
    const subtitleMask = document.getElementById('subtitle-mask');
    const subtitleTrack = document.getElementById('subtitle-track');
    subtitleTrack.innerHTML = ''; subtitleMask.style.opacity = '1';
    subtitleTrack.style.transform = 'translateX(0px)';
    
    const words = text.split(" ");
    const spans = [];
    words.forEach(word => {
        const s = document.createElement('span'); s.textContent = word; s.className = 'char-span'; 
        subtitleTrack.appendChild(s); spans.push(s);
    });
    
    let wordIndex = 0;
    const moodData = window.MOOD_AUDIO[window.glitchMode ? "GLITCH" : window.currentMood] || window.MOOD_AUDIO["NEUTRAL"];
    const speedMod = moodData.speed;

    function playNextWord() {
        if(wordIndex >= words.length) {
            window.activeWordMode = false;
            globalAtmosphereMod = { speed: 1.0, sep: 0, align: 0, wave: 0 };
            window.stopBreathStream(); 
            window.triggerGraphDissolve();
            setTimeout(() => { subtitleMask.style.opacity='0'; setTimeout(()=>subtitleTrack.innerHTML='', 1000); }, 100); 
            return;
        }
        
        if(wordIndex > 0) spans[wordIndex-1].classList.remove('active');
        spans[wordIndex].classList.add('active');
        const spanCenter = spans[wordIndex].offsetLeft + (spans[wordIndex].offsetWidth / 2);
        subtitleTrack.style.transform = `translateX(${-spanCenter}px)`;
        
        const currentWord = words[wordIndex].toUpperCase();
        window.activeWordMode = true;

        let sharpCount = (currentWord.match(/[KTPXZGQ]/g) || []).length;
        
        if(sharpCount > 1 || currentWord.length < 4) {
            globalAtmosphereMod = { speed: 1.2, sep: -5, align: 0.8, wave: 1.5 };
            window.morphMouthShape('I'); 
            window.currentIntensity = 1.0; 
        } else {
            globalAtmosphereMod = { speed: 0.8, sep: 10, align: 0.5, wave: 0.5 };
            window.morphMouthShape('O'); 
            window.currentIntensity = 0.5; 
        }

        setTimeout(() => { window.currentIntensity = 0.2; }, 150 * speedMod);

        wordIndex++;
        let duration = Math.max(250, currentWord.length * 70) * speedMod;
        setTimeout(playNextWord, duration);
    }
    
    playNextWord();
};

window.initSymbiosisAnimation = function() {
    const canvas = document.getElementById('symbiosisCanvas');
    const container = document.getElementById('symbiosis-container');
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let width, height;

    const boids = [];
    for(let i=0; i<FLOCK_SIZE; i++) boids.push(new Boid());
    window.globalBoidsArray = boids;

    function resize() {
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.resetTransform();
        ctx.scale(dpr, dpr); 
        width = rect.width; 
        height = rect.height;
        window.canvasLogicalWidth = width;
        window.canvasLogicalHeight = height;
    }
    window.addEventListener('resize', resize); resize();

    // MISSING FUNCTION RESTORED & OPTIMIZED
    function roundRect(ctx, x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
    }

    function drawDiamond(ctx, x, y, r) {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
    }

    function lerpRGB(curr, target, factor) {
        curr.r += (target.r - curr.r) * factor;
        curr.g += (target.g - curr.g) * factor;
        curr.b += (target.b - curr.b) * factor;
    }

    let rotationX=0, rotationY=0;
    let time = 0;
    let mouse = { x: -1000, y: -1000, vx: 0, vy: 0, active: false };
    let rawMouse = { x: -1000, y: -1000, active: false };

    function handleInputCoords(cx, cy) {
        const r = container.getBoundingClientRect();
        rawMouse.x = (cx - r.left) - (width/2);
        rawMouse.y = (cy - r.top) - (height*0.35);
        rawMouse.active = true;
    }

    container.addEventListener('mousemove', e => handleInputCoords(e.clientX, e.clientY));
    container.addEventListener('touchmove', e => {
        e.preventDefault(); 
        handleInputCoords(e.touches[0].clientX, e.touches[0].clientY);
    }, {passive: false});
    container.addEventListener('touchend', () => { 
        rawMouse.active = false; rawMouse.x = -1000;
    });

    function project(b, cx, cy) {
        const fov = 600; 
        let x = b.pos.x, y = b.pos.y, z = b.pos.z;
        if(window.glitchMode) { x+=(Math.random()-0.5)*15; y+=(Math.random()-0.5)*15; }
        
        if(window.activeWordMode) {
            let wave = Math.sin(x * 0.05 + time * 15) * (window.currentIntensity * 5);
            y += wave; 
        }

        const x1=x*Math.cos(rotationY)-z*Math.sin(rotationY);
        const z1=z*Math.cos(rotationY)+x*Math.sin(rotationY);
        const y2=y*Math.cos(rotationX)-z1*Math.sin(rotationX);
        const z2=z1*Math.cos(rotationX)+y*Math.sin(rotationX);
        
        const scale = fov / (fov + z2 + 500);
        return { x: cx + x1*scale, y: cy + y2*scale, z: z2, scale: scale, boid: b, nodeData: b.nodeData };
    }

    function animate() {
        // --- CINEMATIC VOID VIGNETTE ---
        let bgGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width * 0.85);
        if(window.glitchMode && Math.random() > 0.8) {
            bgGrad.addColorStop(0, `rgba(50, 0, 0, 0.9)`); 
            bgGrad.addColorStop(1, `rgba(0, 0, 0, 1.0)`);
        } else {
            bgGrad.addColorStop(0, 'rgba(5, 8, 15, 0.2)'); 
            bgGrad.addColorStop(0.6, 'rgba(3, 4, 8, 0.8)');
            bgGrad.addColorStop(1, 'rgba(0, 0, 0, 1.0)'); 
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0,0,width,height);
        
        // Use additive blending for "Holographic" feel
        ctx.globalCompositeOperation = 'lighter'; 

        if(rawMouse.active) {
            let dx = rawMouse.x - mouse.x; let dy = rawMouse.y - mouse.y;
            mouse.x += dx * 0.15; mouse.y += dy * 0.15;
            mouse.vx = dx * 0.15; mouse.vy = dy * 0.15; mouse.active = true;
        } else {
            mouse.active = false; mouse.vx *= 0.9; mouse.vy *= 0.9;
        }

        if(window.activeWordMode) {
            PHYSICS.MAX_SPEED += (7.0 * globalAtmosphereMod.speed - PHYSICS.MAX_SPEED) * 0.1;
            PHYSICS.SEPARATION += (30 + globalAtmosphereMod.sep - PHYSICS.SEPARATION) * 0.1;
            PHYSICS.ALIGN_WEIGHT += (1.5 + globalAtmosphereMod.align - PHYSICS.ALIGN_WEIGHT) * 0.1;
            PHYSICS.WAVE_INTENSITY += (globalAtmosphereMod.wave - PHYSICS.WAVE_INTENSITY) * 0.1;
        } 
        else if (window.isThinking) {
             PHYSICS.MAX_SPEED += (9.0 - PHYSICS.MAX_SPEED) * 0.05;
             PHYSICS.SEPARATION += (15 - PHYSICS.SEPARATION) * 0.05; 
             PHYSICS.ALIGN_WEIGHT += (2.5 - PHYSICS.ALIGN_WEIGHT) * 0.05;
        }
        else {
            PHYSICS.MAX_SPEED += (6.0 - PHYSICS.MAX_SPEED) * 0.05;
            PHYSICS.SEPARATION += (30 - PHYSICS.SEPARATION) * 0.05;
            PHYSICS.ALIGN_WEIGHT += (1.5 - PHYSICS.ALIGN_WEIGHT) * 0.05;
            PHYSICS.WAVE_INTENSITY += (0 - PHYSICS.WAVE_INTENSITY) * 0.1;
        }

        let targetSet = window.PALETTES[window.currentMood] || window.PALETTES["NEUTRAL"]; 
        if (window.glitchMode) targetSet = { pri:{r:255,g:255,b:255}, sec:{r:255,g:0,b:0}, conn:{r:100,g:0,b:0} };
        lerpRGB(window.curPalette.pri, targetSet.pri, 0.15);
        lerpRGB(window.curPalette.sec, targetSet.sec, 0.15);
        lerpRGB(window.curPalette.conn, targetSet.conn, 0.15);

        const cx = width/2;
        const cy = height*0.35;
        time += 0.005; 
        
        rotationY = Math.sin(time*0.1) * 0.1; 
        rotationX = Math.sin(time*0.15)*0.05;
        if(digestionGlow > 0) digestionGlow *= 0.94;

        boids.forEach(b => b.update(boids, mouse, width, height, time));

        if(window.feedingActive && foodParticles.length > 0) {
             for(let i=foodParticles.length-1; i>=0; i--) {
                 let fp = foodParticles[i];
                 fp.y += fp.vy;
                 fp.x += (0 - fp.x) * 0.04; 
                 if(Math.abs(fp.y) < 100 && Math.abs(fp.x) < 200) {
                     fp.scale -= 0.15; 
                     fp.vy *= 0.6; 
                     if(fp.scale <= 0.1) {
                         if(boids.length < MAX_FLOCK) {
                             let newB = new Boid(fp.x, fp.y, 0, true, {x: (Math.random()-0.5)*10, y: -5});
                             boids.push(newB);
                         }
                         digestionGlow += 0.2;
                         eatenFoodCount++;
                         foodParticles.splice(i, 1);
                     }
                 }
             }
        }

        const proj = boids.map(b => project(b, cx, cy));
        
        // DRAW LINES - HOLOGRAPHIC CONNECTIONS
        const lineAlphaMod = window.questionMode ? 0.3 : 1.0;
        ctx.beginPath(); // Batch line drawing
        
        for(let i=0; i<proj.length; i++) {
            let p1 = proj[i];
            if(p1.scale < 0) continue;
            
            for(let j=1; j<3; j++) {
                let p2 = proj[(i+j*7)%proj.length]; 
                let dx = p1.x - p2.x; let dy = p1.y - p2.y;
                let dSq = dx*dx + dy*dy;
                let maxD = 60 * p1.scale;

                if(dSq < maxD*maxD) {
                    let alpha = (1 - Math.sqrt(dSq)/maxD) * 0.3 * p1.scale * lineAlphaMod;
                    
                    // PERFORMANCE OPTIMIZATION: Skip invisible lines
                    if (alpha < 0.05) continue;

                    let c = p1.boid.color; 
                    let yFactor = Math.min(1, Math.max(0, p1.y / height));
                    let rMod = c.r + (yFactor * 20);
                    let bMod = c.b + ((1-yFactor) * 40);

                    ctx.strokeStyle = `rgba(${Math.floor(rMod)},${Math.floor(c.g)},${Math.floor(bMod)},${alpha})`;
                    
                    ctx.beginPath(); 
                    ctx.moveTo(p1.x, p1.y); 
                    ctx.lineTo(p2.x, p2.y); 
                    ctx.stroke();
                }
            }
        }

        let graphPoints = proj.filter(p => p.nodeData !== null && p.scale > 0);
        for(let i=graphPoints.length-1; i>=0; i--) {
            let gp = graphPoints[i];
            if(gp.nodeData.dying) {
                if(gp.nodeData.deathTimer > 0) gp.nodeData.deathTimer--;
                else {
                    gp.nodeData.opacity -= 0.025; 
                    if(gp.nodeData.opacity <= 0) {
                        gp.boid.nodeData = null; 
                        graphPoints.splice(i, 1); 
                        continue;
                    }
                }
            } else {
                if(gp.nodeData.opacity < 1.0) gp.nodeData.opacity += 0.02; 
            }
        }

        // DRAW GRAPH CONNECTIONS
        graphPoints.forEach(gp => {
            if (gp.nodeData.parents) {
                gp.nodeData.parents.forEach(parentBoid => {
                    let pp = proj.find(p => p.boid === parentBoid);
                    if (pp && pp.scale > 0 && pp.nodeData) {
                        ctx.lineWidth = Math.max(0.5, (4 - gp.nodeData.level) * 0.8 * gp.scale);
                        let grad = ctx.createLinearGradient(gp.x, gp.y, pp.x, pp.y);
                        let alpha = Math.min(gp.nodeData.opacity, pp.nodeData.opacity) * (0.8 - (gp.nodeData.level * 0.1));
                        let c1 = gp.nodeData.localMoodColor;
                        let c2 = pp.nodeData.localMoodColor;
                        
                        grad.addColorStop(0, `rgba(${Math.floor(c1.r)},${Math.floor(c1.g)},${Math.floor(c1.b)},${alpha})`);
                        grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.5})`); 
                        grad.addColorStop(1, `rgba(${Math.floor(c2.r)},${Math.floor(c2.g)},${Math.floor(c2.b)},${alpha})`);
                        
                        ctx.strokeStyle = grad;
                        ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(pp.x, pp.y); ctx.stroke();
                    }
                });
            }
        });

        const sortedProj = [...proj].sort((a, b) => b.z - a.z);

        // DRAW PARTICLES 
        for(let p1 of sortedProj) {
             if(p1.scale < 0) continue;
             let cObj = p1.boid.color;
             let alpha = Math.min(1, p1.scale * 1.8);
             let rad = (p1.boid.type === 'pri' ? 2.5 : 1.5) * p1.scale;
             
             if (p1.nodeData) {
                 cObj = p1.nodeData.localMoodColor;
                 rad *= 2.2;
                 alpha = 1.0 * p1.nodeData.opacity; 
             }
             
             if(p1.boid.bornTime > 0) { cObj = {r:255,g:255,b:255}; alpha = 1; rad *= 2.5; }
             if(p1.boid.fear > 0) { rad *= 1.3; }
             
             ctx.fillStyle = `rgba(${Math.floor(cObj.r)},${Math.floor(cObj.g)},${Math.floor(cObj.b)},${alpha})`;
             
             // GEOMETRIC RENDERING
             if (p1.nodeData) {
                 // Active Nodes (Large Diamonds)
                 ctx.beginPath();
                 drawDiamond(ctx, p1.x, p1.y, rad * 1.5);
                 ctx.fill();
                 
                 // Pulse Ring
                 let pulse = 1.0 + Math.sin(time * 5 + p1.boid.index) * 0.3;
                 ctx.strokeStyle = `rgba(${Math.floor(cObj.r)},${Math.floor(cObj.g)},${Math.floor(cObj.b)},${alpha * 0.3})`;
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.arc(p1.x, p1.y, rad * 2 * pulse, 0, Math.PI*2);
                 ctx.stroke();
             } else {
                 // Background Stars: Optimized fillRect (Faster than paths)
                 // We use a tiny square rotated 45deg conceptually, but at this scale, a rect is fine
                 if (rad < 2) {
                     ctx.fillRect(p1.x - rad/2, p1.y - rad/2, rad, rad);
                 } else {
                     ctx.beginPath();
                     drawDiamond(ctx, p1.x, p1.y, rad);
                     ctx.fill();
                 }
             }
        }

        ctx.globalCompositeOperation = 'source-over'; 
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        let graphNodes = sortedProj.filter(p => p.nodeData !== null && p.scale > 0);

        for(let gp of graphNodes) {
             let baseSize = 26;
             if (gp.nodeData.level === 2) baseSize = 18;
             if (gp.nodeData.level === 3) baseSize = 12;
             
             let fontSize = Math.floor(baseSize * gp.scale);
             if(fontSize < 9) fontSize = 9; 
             
             ctx.font = `bold ${fontSize}px 'Courier New'`;
             
             let textAlpha = 1.0 * gp.nodeData.opacity;
             let c = gp.nodeData.localMoodColor;

             let metrics = ctx.measureText(gp.nodeData.text);
             let boxW = metrics.width + (24 * gp.scale);
             let boxH = fontSize + (12 * gp.scale);
             let boxX = gp.x - boxW/2;
             let boxY = gp.y - (20*gp.scale) - boxH/2;
             let boxRad = 8 * gp.scale;

             // Glassy background
             ctx.fillStyle = `rgba(5, 8, 15, ${0.8 * gp.nodeData.opacity})`; 
             roundRect(ctx, boxX, boxY, boxW, boxH, boxRad);
             
             // Accent border
             ctx.strokeStyle = `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${textAlpha * 0.4})`;
             ctx.lineWidth = 1;
             ctx.stroke();

             // Text Glitch Effect
             if (window.isThinking && Math.random() > 0.9) {
                 ctx.fillStyle = `rgba(255, 0, 0, ${textAlpha})`;
                 ctx.fillText(gp.nodeData.text, gp.x - 2, gp.y - (20*gp.scale));
                 ctx.fillStyle = `rgba(0, 255, 255, ${textAlpha})`;
                 ctx.fillText(gp.nodeData.text, gp.x + 2, gp.y - (20*gp.scale));
             }

             ctx.fillStyle = `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${textAlpha})`; 
             ctx.fillText(gp.nodeData.text, gp.x, gp.y - (20*gp.scale));
        }

        if(digestionGlow > 0.05) {
            let r = 100 + digestionGlow*200;
            let grg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            let c = window.curPalette.pri;
            grg.addColorStop(0, `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${digestionGlow*0.5})`);
            grg.addColorStop(1, "transparent");
            ctx.fillStyle = grg;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        }

        ctx.font = "10px monospace";
        indicesList.forEach((lbl, i) => {
            let idx = Math.floor((i/indicesList.length) * proj.length);
            let p = proj[idx];
            if(p && p.scale > 0.7) { 
                let c = p.boid.color;
                ctx.fillStyle = `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${0.6})`;
                ctx.fillText(lbl, p.x+12, p.y+4);
            }
        });

        if(window.feedingActive && foodParticles.length > 0) {
            ctx.font = "bold 22px 'Courier New'";
            for(let fp of foodParticles) {
                let x = cx + fp.x;
                let y = cy + fp.y;
                ctx.save(); ctx.translate(x, y); ctx.scale(fp.scale, fp.scale);
                let shimmer = 0.5 + Math.sin(time*20)*0.5;
                let c = window.curPalette.pri;
                ctx.fillStyle = `rgba(${Math.floor(c.r)},${Math.floor(c.g)},${Math.floor(c.b)},${0.8+shimmer*0.2})`;
                ctx.fillText(fp.char, 0, 0);
                ctx.restore();
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
};