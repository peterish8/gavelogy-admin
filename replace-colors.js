/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, 'src');
const skipFiles = ['src/app/auth/login/page.tsx', 'src/components/ui/'];

// Make paths absolute for skipping if needed, or just check substring
const isSkipped = (filePath) => skipFiles.some(skip => filePath.replace(/\\/g, '/').includes(skip));

const replacements = [
    { from: /\btext-slate-900\b/g, to: 'text-foreground' },
    { from: /\btext-slate-800\b/g, to: 'text-foreground' },
    { from: /\btext-slate-700\b/g, to: 'text-foreground/90' },
    { from: /\btext-slate-600\b/g, to: 'text-muted-foreground' },
    { from: /\btext-slate-500\b/g, to: 'text-muted-foreground' },
    { from: /\btext-slate-400\b/g, to: 'text-muted-foreground/70' },
    { from: /\btext-slate-300\b/g, to: 'text-muted-foreground/50' },
    { from: /\btext-gray-600\b/g, to: 'text-muted-foreground' },
    { from: /\btext-gray-500\b/g, to: 'text-muted-foreground' },
    { from: /\bbg-gray-50\b/g, to: 'bg-muted' },
    { from: /\bbg-gray-300\b/g, to: 'bg-muted' },
    { from: /\bbg-slate-200\b/g, to: 'bg-muted' }, // Works for badges and dividers
    { from: /\bbg-slate-300\b/g, to: 'bg-muted' }, 
    { from: /\bborder-gray-100\b/g, to: 'border-border' },
    { from: /\bborder-gray-200\b/g, to: 'border-border' },
    { from: /\bborder-slate-200\b/g, to: 'border-border' },
    { from: /\bborder-slate-300\b/g, to: 'border-border' },
    { from: /\bborder-slate-400\b/g, to: 'border-border' },
    { from: /\bhover:bg-slate-200\b/g, to: 'hover:bg-muted' },
];

let changedFiles = 0;

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(targetDir);

files.forEach(file => {
    if (isSkipped(file)) {
        return; // Skip ui components and login page
    }

    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    replacements.forEach(r => {
        content = content.replace(r.from, r.to);
    });

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated: ${file}`);
        changedFiles++;
    }
});

console.log(`\nReplacement complete. Modified ${changedFiles} files.`);
