import { GoogleGenAI, Modality } from "@google/genai";
import { Story } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateStoryFromImage(imageBase64: string, mood?: string, contextText?: string): Promise<Partial<Story>> {
  const moodContext = mood ? `The user is currently feeling ${mood}. ` : "";
  const caregiverContext = contextText ? `Caregiver provided context: "${contextText}". Use this as the foundation for the memory. ` : "";
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64.split(",")[1] || imageBase64,
            },
          },
          {
            text: `You are a warm, compassionate reminiscence therapist for an Alzheimer's patient. 
            ${moodContext}${caregiverContext}Analyze this family photo and "hallucinate" a beautiful, warm, and comforting memory. 
            
            If the user is feeling sad, anxious, or lonely, the memory should be especially uplifting, grounding, and reassuring to help improve their emotional state.
            
            Return a JSON object with:
            - title: A short, nostalgic title (e.g., "Summer of 1974")
            - location: A plausible location (e.g., "Pine Lake Resort")
            - date: A plausible year or season
            - narrative: A 2-3 sentence warm narration starting with "Remember..." or "Do you recall..." focusing on sensory details (smells, sounds, feelings).
            
            Keep the tone gentle and reassuring.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const result = await model;
  return JSON.parse(result.text || "{}");
}

export async function generateStoryAudio(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `TTS: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");
  
  return base64Audio;
}

export async function generateSamplePhoto(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: `A high-quality, warm, vintage-style family photograph from the 1950s-1980s. ${prompt}. Soft lighting, slightly faded colors, nostalgic atmosphere.`,
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Failed to generate image");
}
