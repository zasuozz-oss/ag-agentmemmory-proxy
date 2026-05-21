import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function projectRoot() {
    return path.resolve(__dirname, '..', '..');
}
function templatesSkillsRoot() {
    return path.join(projectRoot(), 'src', 'templates', 'skills');
}
function customSkillsRoot() {
    return path.join(projectRoot(), 'custom', 'skills');
}
async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    for (const entry of await fs.readdir(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory())
            await copyDir(srcPath, destPath);
        else
            await fs.copyFile(srcPath, destPath);
    }
}
export function antigravitySkillsPath(home = os.homedir()) {
    return path.join(home, '.gemini', 'antigravity', 'skills');
}
export async function installAntigravitySkills() {
    const target = antigravitySkillsPath();
    await copyDir(templatesSkillsRoot(), target);
    const hasCustom = await fs.access(customSkillsRoot()).then(() => true).catch(() => false);
    if (hasCustom)
        await copyDir(customSkillsRoot(), target);
    return target;
}
