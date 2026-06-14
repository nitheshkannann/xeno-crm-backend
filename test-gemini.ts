import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function main() {
  // We can't easily list models via the SDK sometimes without the full google-auth-library,
  // but let's try calling embedContent on gemini-3.5-flash just in case.
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    await model.embedContent('test');
    console.log('text-embedding-004 worked');
  } catch (e) {
    console.error('text-embedding-004 failed:', e.message);
  }
}

main();
