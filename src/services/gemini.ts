import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { Story } from "../types";

const getAI = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

export async function generateStoryFromImage(imageBase64: string, mood?: string, contextText?: string): Promise<Partial<Story>> {
  const ai = getAI();
  const moodContext = mood ? `The user is currently feeling ${mood}. ` : "";
  const caregiverContext = contextText ? `Caregiver provided context: "${contextText}". Use this as the foundation for the memory. ` : "";
  const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  
  if (base64Data.startsWith("http")) {
    throw new Error("Image must be a base64 string, not a URL. Please convert the URL to base64 before calling this function.");
  }

  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data,
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
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const result = await model;
  return JSON.parse(result.text || "{}");
}

export async function generateStoryAudio(text: string): Promise<string> {
  const ai = getAI();
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

export async function generateMusic(mood: string): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ 
      parts: [{ 
        text: `Generate a 30-second background music track that is ${mood}. 
        It should be instrumental, soothing, and appropriate for reminiscence therapy. 
        Focus on soft piano, acoustic guitar, or gentle orchestral strings.` 
      }] 
    }],
    config: {
      responseModalities: [Modality.AUDIO],
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate music");
  
  return base64Audio;
}

export async function generateSamplePhoto(prompt: string): Promise<string> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
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
        imageSize: "1K"
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
