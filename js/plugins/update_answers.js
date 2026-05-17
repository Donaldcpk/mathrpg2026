const fs = require('fs');
const path = require('path');

// Configuration
const csvFiles = [
    { path: '/Users/cdlanod/Downloads/Answer Key F1.csv', prefix: 'S1' },
    { path: '/Users/cdlanod/Downloads/Answer Key F2.csv', prefix: 'S2' },
    { path: '/Users/cdlanod/Downloads/Answer Key F3.csv', prefix: 'S3' }
];

const dbPath = '/Users/cdlanod/Downloads/testingX6/js/plugins/questionDatabase.js';

// 1. Read and Parse CSVs
const answerMap = {}; // { "S1_CH": { "1A01": { 1: "A", ... } } }

function parseCSV(filePath, prefix) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Strip BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }

    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return;

    const headers = lines[0].split(',');
    
    // Identify blocks
    const blocks = [];
    for (let i = 0; i < headers.length; i += 4) {
        const header = headers[i];
        if (!header) continue;
        
        // Extract Chapter and Lang
        const match = header.match(/^([0-9A-Z]+)(中文|英文)答案/);
        if (match) {
            const chapter = match[1];
            const lang = match[2] === '中文' ? 'CH' : 'EN';
            const key = `${prefix}_${lang}`;
            
            blocks.push({
                key: key,
                chapter: chapter,
                colIndex: i + 2 
            });
            
            if (!answerMap[key]) answerMap[key] = {};
            if (!answerMap[key][chapter]) answerMap[key][chapter] = {};
            
            // Q1 is in Row 0
            const q1Ans = headers[i + 2];
            if (q1Ans && q1Ans.trim()) {
                answerMap[key][chapter][1] = q1Ans.trim();
            }
        }
    }

    // Process subsequent rows for Q2...
    for (let r = 1; r < lines.length; r++) {
        const row = lines[r].split(',');
        for (const block of blocks) {
            const ans = row[block.colIndex];
            const qNum = r + 1;
            
            if (ans && ans.trim()) {
                answerMap[block.key][block.chapter][qNum] = ans.trim();
            }
        }
    }
}

// Execute parsing
csvFiles.forEach(f => {
    if (fs.existsSync(f.path)) {
        console.log(`Parsing ${f.path}...`);
        parseCSV(f.path, f.prefix);
    } else {
        console.warn(`File not found: ${f.path}`);
    }
});

// 2. Read Database
let dbContent = fs.readFileSync(dbPath, 'utf8');

const lines = dbContent.split('\n');
let currentKey = null;
let currentQNumMap = {}; 

const newLines = lines.map(line => {
    // Detect Category Key
    const keyMatch = line.match(/^\s*"([S0-9]+_[A-Z]+)":\s*\[/);
    if (keyMatch) {
        currentKey = keyMatch[1];
        currentQNumMap = {}; 
        return line;
    }

    // Detect Object Line
    if (line.trim().startsWith('{') && currentKey) {
        const noteMatch = line.match(/"Note":"([^"]+)"/);
        if (noteMatch) {
            let chapter = noteMatch[1];
            
            // Normalize Chapter ID from DB Note
            // If English key, strip 'EN' suffix if present
            if (currentKey.endsWith('_EN') && chapter.endsWith('EN')) {
                chapter = chapter.slice(0, -2);
            }
            
            // Increment Question Number counter
            // Use the original note value for tracking count to distinguish 1A01 and 1A01EN if mixed (though unlikely in same key)
            // Actually, we should track by the *chapter* we are looking up.
            // But wait, the DB list is sequential.
            // "Note":"1A01", "Note":"1A01"...
            
            // Let's use the chapter ID for counting.
            if (!currentQNumMap[chapter]) currentQNumMap[chapter] = 0;
            currentQNumMap[chapter]++;
            const qNum = currentQNumMap[chapter];

            // Look up answer
            let ans = "?";
            if (answerMap[currentKey] && 
                answerMap[currentKey][chapter] && 
                answerMap[currentKey][chapter][qNum]) {
                ans = answerMap[currentKey][chapter][qNum];
            }

            // Replace C_A
            // Regex to replace "C_A":"?" or existing value
            // We use a regex that matches the key and value carefully
            if (ans !== "?") {
                return line.replace(/"C_A":"[^"]*"/, `"C_A":"${ans}"`);
            }
        }
    }
    
    return line;
});

// 3. Write Output
fs.writeFileSync(dbPath, newLines.join('\n'));
console.log("Database updated with answers (Fixed BOM & ID matching)!");
