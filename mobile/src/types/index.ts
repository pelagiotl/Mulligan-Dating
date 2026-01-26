/**
 * Shared TypeScript types
 * These match the web app types for consistency
 */

export interface User {
  id: string;
  email?: string | null;
  phoneNumber?: string | null;
  isAdmin?: boolean;
}

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  bio?: string | null;
  location?: string | null;
  photoUrl?: string | null;
  lookingFor?: string | null;
}

export interface Photo {
  id: string;
  url: string;
  isPrimary: boolean;
  order: number;
}

export interface Match {
  id: string;
  userId: string;
  matchedUserId: string;
  createdAt: string;
  otherUser: {
    id: string;
    displayName: string;
    photoUrl?: string | null;
    age: number;
    gender: string;
    bio?: string | null;
    location?: string | null;
  };
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  readAt?: string | null;
  isOwn: boolean;
}








