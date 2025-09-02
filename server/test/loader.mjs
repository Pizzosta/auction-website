// This loader helps Mocha work with ES modules
import { pathToFileURL } from 'node:url';

export async function loadFile(file) {
  const url = pathToFileURL(file);
  url.searchParams.append('t', Date.now()); // Cache busting
  
  try {
    await import(url);
  } catch (error) {
    console.error(`Error loading file: ${file}`);
    console.error(error);
    throw error;
  }
}

export { loadFile as default };
