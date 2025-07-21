// script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const el = {
        startButton: document.getElementById('startButton'), statusDisplay: document.getElementById('status'),
        logContent: document.getElementById('logContent'), visualizerCanvas: document.getElementById('audio-visualizer-canvas'),
        infoDisplay: document.getElementById('info-display'), suggestionsContainer: document.getElementById('suggestions-container'),
        resultDisplay: document.getElementById('result-display'), permissionModal: document.getElementById('permission-modal'),
        allowMicButton: document.getElementById('allow-mic'), textCommandForm: document.getElementById('text-command-form'),
        textInput: document.getElementById('text-input'), settingsButton: document.getElementById('settings-button'),
        settingsPanel: document.getElementById('settings-panel'), themeToggle: document.getElementById('theme-toggle'),
        languageSelect: document.getElementById('language-select'),
        loginsBtn: document.getElementById('logins-btn'),
        loginsModal: document.getElementById('logins-modal'),
        logPanel: document.getElementById('log-panel'), sidebarPanel: document.getElementById('sidebar-panel'),
        toggleLogBtn: document.getElementById('toggle-log-btn'), toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
    };
    const visualizerCtx = el.visualizerCanvas.getContext('2d');

    // --- State Management ---
    let isListening = false;
    let audioContext, analyser, source, dataArray, animationFrameId, recognition;
    const GEMINI_API_KEY = "AIzaSyCqpMtSAUqg464NM7zP-Acpr4vImSxp0oM"; 
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    let chatHistory = [];
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const synth = window.speechSynthesis;
    let voices = [];
    
    // --- Initialization ---
    function initialize() {
        setupEventListeners();
        updateInfoDisplay();
        populateSettings();
        showInitialSuggestions();
        setInterval(updateInfoDisplay, 60000);
    }
    
    function setupEventListeners() {
        el.allowMicButton.addEventListener('click', requestMicPermission);
        el.startButton.addEventListener('click', toggleListening);
        el.textCommandForm.addEventListener('submit', handleTextCommand);
        el.settingsButton.addEventListener('click', () => { el.settingsPanel.style.display = el.settingsPanel.style.display === 'block' ? 'none' : 'block'; });
        el.themeToggle.addEventListener('change', (e) => document.body.classList.toggle('light-mode', e.target.checked));
        el.languageSelect.addEventListener('change', () => { if(recognition) recognition.lang = el.languageSelect.value; });
        el.loginsBtn.addEventListener('click', () => el.loginsModal.classList.add('active'));
        document.querySelectorAll('.modal-close-btn').forEach(btn => btn.addEventListener('click', () => el.loginsModal.classList.remove('active')));
        el.logContent.addEventListener('click', handleLogActions);
        el.toggleLogBtn.addEventListener('click', () => { el.logPanel.classList.toggle('active'); el.sidebarPanel.classList.remove('active'); });
        el.toggleSidebarBtn.addEventListener('click', () => { el.sidebarPanel.classList.toggle('active'); el.logPanel.classList.remove('active'); });
        document.body.addEventListener('click', (e) => {
            if (!el.settingsPanel.contains(e.target) && !el.settingsButton.contains(e.target)) el.settingsPanel.style.display = 'none';
            if (el.logPanel.classList.contains('active') && !el.logPanel.contains(e.target) && e.target !== el.toggleLogBtn) el.logPanel.classList.remove('active');
            if (el.sidebarPanel.classList.contains('active') && !el.sidebarPanel.contains(e.target) && e.target !== el.toggleSidebarBtn) el.sidebarPanel.classList.remove('active');
        });
    }

    // --- Permission and Setup ---
    function requestMicPermission() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                el.permissionModal.classList.remove('active');
                el.statusDisplay.textContent = "Press Activate and speak";
                el.startButton.disabled = false;
                setupSpeechAPI();
                initAudio(stream);
            }).catch(err => {
                console.error("Microphone access denied:", err);
                el.permissionModal.querySelector('.modal-content').innerHTML = `<h2>Microphone Access Denied</h2><p>J.A.R.V.I.S. cannot function without microphone access. Please enable it in your browser settings and refresh the page.</p>`;
            });
    }

    function setupSpeechAPI() {
        if (!SpeechRecognition) { console.error("Speech Recognition not supported."); el.statusDisplay.textContent = "Speech Recognition not supported."; el.startButton.disabled = true; el.permissionModal.classList.remove('active'); return; }
        recognition = new SpeechRecognition();
        Object.assign(recognition, { continuous: false, lang: el.languageSelect.value, interimResults: false, maxAlternatives: 1 });
        recognition.onstart = () => { isListening = true; el.startButton.textContent = 'Listening...'; el.startButton.classList.add('active'); el.statusDisplay.textContent = "I'm listening..."; startVisualization(); };
        recognition.onend = () => { isListening = false; el.startButton.textContent = 'Activate'; el.startButton.classList.remove('active'); if (el.statusDisplay.textContent === "I'm listening...") { el.statusDisplay.textContent = "Press Activate and speak"; } stopVisualization(); };
        recognition.onerror = (e) => { console.error('Speech recognition error:', e.error); el.statusDisplay.textContent = `Error: ${e.error}`; if (e.error === 'no-speech') { el.statusDisplay.textContent = "I didn't hear anything. Try again."; } };
        recognition.onresult = (e) => { const transcript = e.results[0][0].transcript.trim(); el.statusDisplay.textContent = `You said: "${transcript}"`; addToLog(transcript, 'user'); processCommand(transcript); };
    }
    
    function handleTextCommand(e) { e.preventDefault(); const command = el.textInput.value.trim(); if (command) { addToLog(command, 'user'); processCommand(command); el.textInput.value = ''; } }

    // --- Robust Link Opener ---
    function openLinkInNewTab(url) {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- Command Processing ---
    function processCommand(command) {
        const lowerCaseCommand = command.toLowerCase();
        clearResultDisplay();

        // --- UPDATED: Intelligent Search Routing ---
        const youtubeKeywords = ['play', 'song', 'video', 'watch', 'trailer', 'music video', 'search youtube for'];
        const googleKeywords = ['search for', 'google', 'details of', 'what is', 'who is', 'tell me about', 'information on', 'how to'];

        // Check for YouTube command
        if (youtubeKeywords.some(keyword => lowerCaseCommand.startsWith(keyword))) {
            const query = lowerCaseCommand.replace(new RegExp(`^(${youtubeKeywords.join('|')})\\s+`), '');
            openLinkInNewTab(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
            finalizeResponse(
                `Searching YouTube for "${query}". Please check the new tab for results.`,
                'https://placehold.co/300x200/c4302b/ffffff?text=YouTube',
                ['Play another song', 'What time is it?', 'Search Google for news']
            );
            return; 
        }

        // Check for Google command
        if (googleKeywords.some(keyword => lowerCaseCommand.startsWith(keyword))) {
            const query = lowerCaseCommand.replace(new RegExp(`^(${googleKeywords.join('|')})\\s+`), '');
            openLinkInNewTab(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
            finalizeResponse(`Searching Google for "${query}".`);
            return; 
        }

        // --- Existing Commands ---
        if (lowerCaseCommand.includes('what time is it')) {
            const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            finalizeResponse(`The current time is ${timeString}.`, 'https://placehold.co/300x200/02001a/00e5ff?text=Time', ['What is today\'s date?', 'Set a timer for 5 minutes']);
        } else if (lowerCaseCommand.includes('what is the date')) {
            const dateString = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            finalizeResponse(`Today is ${dateString}.`, 'https://placehold.co/300x200/02001a/00e5ff?text=Calendar', ['What is the weather?', 'Any events today?']);
        } else if (lowerCaseCommand.includes('what is the weather')) {
            finalizeResponse("The weather in Hyderabad is currently clear and sunny, with a temperature of 32 degrees Celsius.", 'https://placehold.co/300x200/02001a/00e5ff?text=Sunny', ['Is it going to rain?', 'How is the traffic?']);
        } else if (lowerCaseCommand.startsWith('open ')) {
            const site = lowerCaseCommand.replace('open ', '').replace(/\s/g, '');
            let url = `https://${site}`;
            if (!site.includes('.')) { url = `https://${site}.com`; }
            openLinkInNewTab(url);
            finalizeResponse(`Opening ${site}.`, null, ['Search Google for "AI news"', 'Search YouTube for tutorials']);
        } else {
            // Fallback to Gemini for conversational queries
            getGeminiResponse(command);
        }
    }

    // --- Core Functions ---
    function toggleListening() { if (!recognition) return; isListening ? recognition.stop() : recognition.start(); }
    function initAudio(stream) { if (!audioContext) { audioContext = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioContext.createAnalyser(); analyser.fftSize = 2048; source = audioContext.createMediaStreamSource(stream); source.connect(analyser); dataArray = new Uint8Array(analyser.frequencyBinCount); } }
    async function getGeminiResponse(prompt, isTranslation = false) {
        el.statusDisplay.textContent = 'Thinking...';
        const currentHistory = isTranslation ? [] : chatHistory;
        const payload = { contents: [...currentHistory, { role: "user", parts: [{ text: prompt }] }] };

        try {
            const response = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(`API Error: ${errorData.error.message}`);
            }
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
                if (isTranslation) {
                    speak(text);
                    addToLog(`Translation: ${text}`, 'jarvis');
                } else {
                    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
                    chatHistory.push({ role: "model", parts: [{ text }] });
                    finalizeResponse(text, 'https://placehold.co/300x200/02001a/ff00c8?text=J.A.R.V.I.S.', ['Tell me a fun fact', 'Summarize this page', 'Translate "Hello" to Telugu']);
                }
            } else { throw new Error("Invalid response structure from API."); }
        } catch (error) {
            console.error('Error fetching from Gemini API:', error);
            const errorMessage = "I'm sorry, I seem to be having trouble connecting. Please check the API key and try again later.";
            finalizeResponse(errorMessage);
        }
    }
    function speak(text) {
        if (synth.speaking) synth.cancel();
        el.statusDisplay.textContent = 'Speaking...';
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voices.find(v => v.lang.startsWith(el.languageSelect.value.split('-')[0])) || voices[0];
        utterance.pitch = 1; utterance.rate = 1;
        utterance.onstart = () => startVisualizationFromUtterance(utterance);
        utterance.onend = () => { el.statusDisplay.textContent = "Press Activate and speak"; stopVisualization(); };
        utterance.onerror = (e) => { console.error('SpeechSynthesisUtterance.onerror', e); stopVisualization(); };
        synth.speak(utterance);
    }
    
    // --- UI & Settings ---
    function finalizeResponse(text, imageUrl, suggestions) { addToLog(text, 'jarvis'); speak(text); if (imageUrl) displayWithImage(text, imageUrl); if (suggestions) showSuggestions(suggestions); }
    function populateSettings() {
        ['en-US', 'te-IN', 'hi-IN', 'fr-FR', 'es-ES', 'de-DE'].forEach(langCode => { el.languageSelect.add(new Option(new Intl.DisplayNames(['en'], {type: 'language'}).of(langCode.split('-')[0]), langCode)); });
        
        function populateVoiceList() { 
            voices = synth.getVoices().sort((a,b) => a.name.localeCompare(b.name)); 
        }
        populateVoiceList();
        if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = populateVoiceList;
    }

    function showInitialSuggestions() { showSuggestions(['What time is it?', 'What is the weather?', 'Open Wikipedia', 'Play lofi beats', 'Tell me a joke about computers', 'Set a timer for 2 minutes', 'Translate "good morning" to Telugu', 'What is the capital of Japan?']); }
    function showSuggestions(suggestions) { el.suggestionsContainer.innerHTML = ''; suggestions.forEach(text => { const chip = document.createElement('div'); chip.className = 'suggestion-chip'; chip.textContent = text; chip.onclick = () => { el.textInput.value = text; handleTextCommand({preventDefault: () => {}}); }; el.suggestionsContainer.appendChild(chip); }); }
    function addToLog(text, sender) { const entry = document.createElement('div'); entry.classList.add('log-entry'); entry.innerHTML = `<div><strong class="${sender}">${sender.charAt(0).toUpperCase() + sender.slice(1)}:</strong> ${text}</div>`; if (sender === 'jarvis') { const actions = document.createElement('div'); actions.className = 'log-actions'; actions.innerHTML = `<button class="like-btn" title="Like">👍</button><button class="dislike-btn" title="Dislike">👎</button><button class="translate-btn" data-text="${text}" title="Translate">🌐</button>`; entry.appendChild(actions); } el.logContent.appendChild(entry); el.logContent.scrollTop = el.logContent.scrollHeight; }
    function handleLogActions(e) {
        const target = e.target;
        if (target.classList.contains('like-btn') || target.classList.contains('dislike-btn')) {
            const parent = target.parentElement;
            parent.querySelector('.like-btn.active')?.classList.remove('active');
            parent.querySelector('.dislike-btn.active')?.classList.remove('active');
            target.classList.add('active');
        } else if (target.classList.contains('translate-btn')) {
            const textToTranslate = target.dataset.text;
            const targetLang = new Intl.DisplayNames(['en'], {type: 'language'}).of(el.languageSelect.value.split('-')[0]);
            const prompt = `Translate the following text to ${targetLang}: "${textToTranslate}"`;
            getGeminiResponse(prompt, true);
        }
    }
    function displayWithImage(text, imageUrl) { el.resultDisplay.innerHTML = `<img src="${imageUrl}" alt="Response visual" onerror="this.style.display='none'"><p>${text}</p>`; }
    function clearResultDisplay() { el.resultDisplay.innerHTML = ''; }
    function updateInfoDisplay() { const now = new Date(); const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); const dateString = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); el.infoDisplay.innerHTML = `<div><span class="info-label">Time:</span> ${timeString}</div><div><span class="info-label">Date:</span> ${dateString}</div><div><span class="info-label">Location:</span> Hyderabad, IN</div>`; }

    // --- Visualization ---
    function startVisualization() { if (!audioContext) return; if (animationFrameId) cancelAnimationFrame(animationFrameId); drawVisualizer(); }
    function stopVisualization() { if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; } let alpha = 1.0; function fadeOut() { visualizerCtx.fillStyle = `rgba(2, 0, 26, ${alpha})`; visualizerCtx.fillRect(0, 0, el.visualizerCanvas.width, el.visualizerCanvas.height); drawStaticOrb(); alpha -= 0.05; if (alpha > 0) requestAnimationFrame(fadeOut); else { visualizerCtx.clearRect(0, 0, el.visualizerCanvas.width, el.visualizerCanvas.height); drawStaticOrb(); } } fadeOut(); }
    async function startVisualizationFromUtterance(utterance) { if (!audioContext) return; if (source && source.mediaStream) source.disconnect(); let speaking = true; utterance.onend = () => { speaking = false; stopVisualization(); if (source && source.mediaStream) source.connect(analyser); }; function simulateSpeechVisualization() { if(!speaking) return; const bufferLength = analyser.frequencyBinCount; for (let i = 0; i < bufferLength; i++) { dataArray[i] = Math.random() * 180 + Math.sin(i + Date.now() / 100) * 50; } drawVisualizerFrame(); animationFrameId = requestAnimationFrame(simulateSpeechVisualization); } simulateSpeechVisualization(); }
    function drawVisualizer() { if (!isListening && !synth.speaking) { stopVisualization(); return; } drawVisualizerFrame(); animationFrameId = requestAnimationFrame(drawVisualizer); }
    function drawVisualizerFrame() { if (!analyser) { drawStaticOrb(); return; } analyser.getByteFrequencyData(dataArray); const width = el.visualizerCanvas.width, height = el.visualizerCanvas.height; const centerX = width / 2, centerY = height / 2; const radius = width * 0.25; visualizerCtx.clearRect(0, 0, width, height); const overallVolume = dataArray.reduce((a, b) => a + b) / dataArray.length; const pulseRadius = radius * 1.5 + (overallVolume / 256) * 30; const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-glow').trim(); visualizerCtx.beginPath(); visualizerCtx.arc(centerX, centerY, pulseRadius, 0, 2 * Math.PI); visualizerCtx.strokeStyle = `${primaryColor}66`; visualizerCtx.lineWidth = 1; visualizerCtx.stroke(); const bufferLength = analyser.frequencyBinCount, barCount = 180; visualizerCtx.save(); visualizerCtx.translate(centerX, centerY); for (let i = 0; i < barCount; i++) { const barHeight = (dataArray[Math.floor(i * (bufferLength / barCount))] / 256) * 100; const angle = (i / barCount) * 2 * Math.PI; visualizerCtx.rotate(angle); const gradient = visualizerCtx.createLinearGradient(0, -radius, 0, -radius - barHeight); gradient.addColorStop(0, `${primaryColor}CC`); gradient.addColorStop(1, `${primaryColor}1A`); visualizerCtx.fillStyle = gradient; visualizerCtx.fillRect(-1, -radius - barHeight, 2, barHeight); visualizerCtx.rotate(-angle); } visualizerCtx.restore(); const coreRadius = radius * 0.8 + (dataArray[10] / 256) * 15; const coreGradient = visualizerCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius); coreGradient.addColorStop(0, 'rgba(255, 0, 200, 0.6)'); coreGradient.addColorStop(0.5, `${primaryColor}66`); coreGradient.addColorStop(1, 'rgba(2, 0, 26, 0)'); visualizerCtx.fillStyle = coreGradient; visualizerCtx.beginPath(); visualizerCtx.arc(centerX, centerY, coreRadius, 0, 2 * Math.PI); visualizerCtx.fill(); drawStaticOrb(false); }
    function drawStaticOrb(clear = true) { const width = el.visualizerCanvas.width, height = el.visualizerCanvas.height; const centerX = width / 2, centerY = height / 2; if(clear) visualizerCtx.clearRect(0, 0, width, height); const baseRadius = width * 0.25; const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-glow').trim(); visualizerCtx.strokeStyle = `${primaryColor}4D`; visualizerCtx.lineWidth = 1; visualizerCtx.beginPath(); visualizerCtx.arc(centerX, centerY, baseRadius * 0.9, 0, 2 * Math.PI); visualizerCtx.stroke(); visualizerCtx.fillStyle = `${primaryColor}CC`; visualizerCtx.shadowColor = primaryColor; visualizerCtx.shadowBlur = 15; visualizerCtx.beginPath(); visualizerCtx.arc(centerX, centerY, baseRadius * 0.2, 0, 2 * Math.PI); visualizerCtx.fill(); visualizerCtx.shadowBlur = 0; }
    function resizeCanvas() { const orbContainer = document.querySelector('.jarvis-orb-container'); const size = orbContainer.clientWidth; el.visualizerCanvas.width = size; el.visualizerCanvas.height = size; drawStaticOrb(); }
    window.addEventListener('resize', resizeCanvas);
    
    initialize();
    setTimeout(resizeCanvas, 100); // Initial resize after layout settles

    // --- 3D Background Scene (Three.js) ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg-canvas'), alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 10000;
    const posArray = new Float32Array(particlesCount * 3);
    for (let i = 0; i < particlesCount * 3; i++) { posArray[i] = (Math.random() - 0.5) * (Math.random() * 500); }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particlesMaterial = new THREE.PointsMaterial({ size: 0.015, color: 0x00e5ff, transparent: true, blending: THREE.AdditiveBlending });
    const particleMesh = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particleMesh);
    camera.position.z = 5;
    const clock = new THREE.Clock();
    function animate() { const elapsedTime = clock.getElapsedTime(); particleMesh.rotation.y = elapsedTime * 0.05; particleMesh.rotation.x = elapsedTime * 0.02; renderer.render(scene, camera); window.requestAnimationFrame(animate); }
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
    animate();
});
