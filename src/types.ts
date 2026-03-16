export interface Story {
  id: string;
  title: string;
  location: string;
  date: string;
  narrative: string;
  imageUrl: string;
  audioUrl?: string;
  isFavorite?: boolean;
}

export interface Memory {
  id: string;
  imageUrl: string;
  description: string;
  date?: string;
  location?: string;
  timestamp: number;
}
