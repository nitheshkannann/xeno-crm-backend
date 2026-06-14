import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Use gemini-3.5-flash — has generous free tier quota
const DEFAULT_MODEL = 'gemini-3.5-flash';

export async function generateStructured<T>(prompt: string, schema: object, modelName = DEFAULT_MODEL): Promise<T> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema as never,
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return JSON.parse(text) as T;
}

import { pipeline } from '@xenova/transformers';

let embedder: any = null;

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const result = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

