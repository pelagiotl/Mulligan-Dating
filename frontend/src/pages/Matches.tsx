import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { getSocketUrl } from "../utils/socketUrl";
import { matchesRouteActiveRef, openMatchIdRef } from "../lib/currentMatchView";
import { api, ApiError } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { getPhotoUrl } from "../utils/photoUrl";
import { formatLastActive } from "../utils/formatLastActive";
import Notification from "../components/Notification";
import ConfirmModal from "../components/ConfirmModal";
import PhotoGalleryUnlockCelebration from "../components/PhotoGalleryUnlockCelebration";
import PhotoUnlockExplainerModalWeb from "../components/PhotoUnlockExplainerModalWeb";
import TruthOrDareWeb from "../components/TruthOrDareWeb";
import NeverHaveIEverWeb from "../components/NeverHaveIEverWeb";
import DateBlueprintWeb from "../components/DateBlueprintWeb";
import GameRequestModalWeb, { type PendingGameRequestWeb } from "../components/GameRequestModalWeb";
import ChatMediaModerationModal, { type ChatMediaKind } from "../components/ChatMediaModerationModal";
import ReportUserModal from "../components/ReportUserModal";
import InterestCompatibilityModal from "../components/InterestCompatibilityModal";
import CompatibilityPulseModal from "../components/CompatibilityPulseModal";
import MatchPartnerProfileSheet from "../components/MatchPartnerProfileSheet";

interface Photo {
  id: string;
  url: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface Match {
  id: string;
  stage: "pending" | "stage1" | "stage2";
  status: string;
  createdAt: string;
  stage1At: string | null;
  stage2At: string | null;
  expiresAt: string | null;
  isInitiator: boolean;
  userWantsReveal?: boolean;
  otherWantsReveal?: boolean;
  unreadCount?: number;
  gameUnlocks?: { truth_or_dare: boolean; never_have_i_ever: boolean };
  /** Engagement-based pulse score (0–100), updates over chat */
  compatibilityScore?: number | null;
  /** Interest overlap 0–100 from profile data */
  profileCompatibility?: number | null;
  otherUser: {
    userId: string;
    displayName: string;
    age: number;
    bio: string | null;
    gender: string;
    location: string | null;
    photoUrl: string | null;
    profileId?: string;
    photos?: Photo[];
    interests: string[];
    values: string[];
    partnerQualities: Array<{ quality: string; importance: number }>;
    lookingFor?: string | null;
    dealbreakers?: string[];
    preferredGenders?: string[] | null;
    /** Present only when the other user has show_active_status enabled. */
    lastActiveAt?: string | null;
  };
}

type PhotoLightboxState = { urls: string[]; index: number };

/** Photos usable for thumbnails / lightbox (stage2 gallery or primary fallback). */
function getOtherUserPhotosForLightbox(match: Match): Photo[] {
  const ou = match.otherUser;
  if (match.stage === "stage2" && ou.photos && ou.photos.length > 0) {
    return [...ou.photos].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }
  if ((match.stage === "stage1" || match.stage === "stage2") && ou.photoUrl?.trim()) {
    return [{ id: "__primary__", url: ou.photoUrl, displayOrder: 0, isPrimary: true }];
  }
  if (ou.photos && ou.photos.length > 0) {
    return [...ou.photos].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }
  return [];
}

/** Aligns with mobile profile-compatibility card (filters legacy bullets). */
function filterInterestCompatReasons(reasons: string[]): string[] {
  return reasons.filter((line) => {
    const low = line.toLowerCase();
    if (low.includes("looking for the same thing")) return false;
    if (low.includes("similar lifestyle preferences")) return false;
    return true;
  });
}

/** Normalize GET /profile `interests` (strings or { name }) for overlap with match. */
function interestsFromProfilePayload(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const raw = d.interests;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item) return String((item as { name: string }).name);
      return "";
    })
    .filter(Boolean);
}

/** Slim photo-unlock reminder in the composer footer (replaces the large scroll-top card). */
function Stage1PhotoUnlockCompact({
  myCount,
  theirCount,
  onOpenExplainer,
}: {
  myCount: number;
  theirCount: number;
  onOpenExplainer: () => void;
}) {
  const userCount = myCount;
  const otherCount = theirCount;
  const bothDone = userCount >= 3 && otherCount >= 3;

  return (
    <div className="chat-composer-unlock" role="note">
      <span className="chat-composer-unlock-icon" aria-hidden>
        🔓
      </span>
      <p className="chat-composer-unlock-text">
        <strong>More photos</strong> unlock when you each send 3 messages.{" "}
        <span className="chat-composer-unlock-counts">
          You{" "}
          <span
            className={
              userCount >= 3
                ? "chat-composer-unlock-count chat-composer-unlock-count--done"
                : "chat-composer-unlock-count"
            }
          >
            {Math.min(userCount, 3)}/3
          </span>
          {" · "}
          Them{" "}
          <span
            className={
              otherCount >= 3
                ? "chat-composer-unlock-count chat-composer-unlock-count--done"
                : "chat-composer-unlock-count"
            }
          >
            {Math.min(otherCount, 3)}/3
          </span>
        </span>
        {bothDone ? (
          <span className="chat-composer-unlock-almost"> — almost there, keep chatting!</span>
        ) : null}
      </p>
      <button type="button" className="chat-composer-unlock-link" onClick={onOpenExplainer}>
        How it works
      </button>
    </div>
  );
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  readAt?: string | null;
  isOwn: boolean;
  /** User id who heart-reacted (only the other participant can love a message). */
  likedBy?: string | null;
  /** User id who laugh-reacted */
  laughedBy?: string | null;
  /** User id who heart-eyes reacted */
  heartEyesBy?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
}

const CHAT_MEDIA_LOCKED_HINT =
  "Photos, video, and voice unlock after you and your match have each sent at least 3 messages in this chat.";
/** Aligns with mobile photo-guidelines modal + explicit tone for locked media taps */
const CHAT_MEDIA_MODERATION_WARNING =
  "Inappropriate photos, video, or voice can get you permanently banned from Mulligan. F**k around and get banned.";

const PULSE_ENGAGEMENT_LABEL: Record<"cold" | "neutral" | "warming" | "hot", string> = {
  cold: "Cool",
  neutral: "Steady",
  warming: "Warming up",
  hot: "Hot streak",
};

export default function Matches() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "info" | "warning" | "error";
    duration?: number;
  } | null>(null);
  const [showUnmatchConfirm, setShowUnmatchConfirm] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<PhotoLightboxState | null>(null);
  /** Full partner profile & photo gallery beside the messaging column */
  const [partnerDrawerOpen, setPartnerDrawerOpen] = useState(false);
  const [mobileShowMatchList, setMobileShowMatchList] = useState(true);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 900
  );
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messageComposerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedMatchIdRef = useRef<string | null>(null);
  const selectedMatchStageRef = useRef<Match["stage"] | null>(null);
  /** Tracks last thread so we only swap composer text when the user opens a different match. */
  const composerMatchIdRef = useRef<string | null>(null);
  /** Per-match message drafts — restored when returning to the same thread. */
  const messageDraftsRef = useRef<Record<string, string>>({});
  const composerTextRef = useRef("");
  const userIdRef = useRef<string | null>(null);
  const matchesRef = useRef<Match[]>([]);
  const lightboxTouchX = useRef<number | null>(null);
  const [gameRequestToShow, setGameRequestToShow] = useState<PendingGameRequestWeb | null>(null);
  const [openGameForAccept, setOpenGameForAccept] = useState<{
    matchId: string;
    gameType: "truth_or_dare" | "never_have_i_ever";
  } | null>(null);
  const [reactionBusyMessageId, setReactionBusyMessageId] = useState<string | null>(null);
  /** Photo / video / voice: locked (not enough messages) or guidelines acknowledgement before capture */
  const [chatMediaModal, setChatMediaModal] = useState<
    { variant: "guidelines" | "locked"; kind: ChatMediaKind } | null
  >(null);
  const [galleryUnlockCelebrationOpen, setGalleryUnlockCelebrationOpen] = useState(false);
  const [photoUnlockExplainerOpen, setPhotoUnlockExplainerOpen] = useState(false);
  const galleryUnlockCelebrationDedupeRef = useRef<{ matchId: string; at: number } | null>(null);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    matchId: string;
    reportedUserId: string;
    displayName: string;
  } | null>(null);

  const [showInterestCompatModal, setShowInterestCompatModal] = useState(false);
  const [showPulseCompatModal, setShowPulseCompatModal] = useState(false);
  const [liveProfileCompatibility, setLiveProfileCompatibility] = useState<number | null>(null);
  const [compatibilityDetails, setCompatibilityDetails] = useState<{
    reasons: string[];
    sharedInterests: string[];
  } | null>(null);
  const [pulseScore, setPulseScore] = useState<number | null>(null);
  const [pulseEngagement, setPulseEngagement] = useState<"cold" | "neutral" | "warming" | "hot" | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreviewUrl, setPendingImagePreviewUrl] = useState<string | null>(null);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  const chatMediaUnlocked = useMemo(() => {
    if (!selectedMatch || !user?.id) return false;
    const myId = user.id;
    const otherId = selectedMatch.otherUser.userId;
    let my = 0;
    let other = 0;
    for (const m of messages) {
      if (m.senderId === myId) my++;
      else if (m.senderId === otherId) other++;
    }
    return my >= 3 && other >= 3;
  }, [messages, selectedMatch?.id, selectedMatch?.otherUser?.userId, user?.id]);

  const chatMediaMessageCounts = useMemo(() => {
    if (!selectedMatch || !user?.id) return { my: 0, their: 0 };
    const myId = user.id;
    const otherId = selectedMatch.otherUser.userId;
    let my = 0;
    let their = 0;
    for (const m of messages) {
      if (m.senderId === myId) my++;
      else if (m.senderId === otherId) their++;
    }
    return { my, their };
  }, [messages, selectedMatch?.id, selectedMatch?.otherUser?.userId, user?.id]);

  const triggerGalleryUnlockCelebration = useCallback((matchId: string) => {
    const now = Date.now();
    const prev = galleryUnlockCelebrationDedupeRef.current;
    if (prev && prev.matchId === matchId && now - prev.at < 6000) return;
    galleryUnlockCelebrationDedupeRef.current = { matchId, at: now };
    setGalleryUnlockCelebrationOpen(true);
  }, []);

  useEffect(() => {
    setGalleryUnlockCelebrationOpen(false);
  }, [selectedMatch?.id]);

  useEffect(() => {
    if (selectedMatch?.stage !== "stage1") setPhotoUnlockExplainerOpen(false);
  }, [selectedMatch?.stage]);

  // Refresh relative last-active labels (mirrors mobile MatchesScreen).
  useEffect(() => {
    const hasAnyExpiring = matches.some((m) => m.expiresAt);
    const updateInterval = hasAnyExpiring ? 1000 : 60000;
    const interval = setInterval(() => setCurrentTime(new Date()), updateInterval);
    return () => clearInterval(interval);
  }, [matches]);

  const getLastActiveLabel = useCallback(
    (lastActiveAt: string | null | undefined) => formatLastActive(lastActiveAt, currentTime),
    [currentTime]
  );

  const dismissGalleryUnlockCelebration = useCallback(() => {
    setGalleryUnlockCelebrationOpen(false);
  }, []);

  const selectedMatchPhotos = useMemo((): Photo[] => {
    if (!selectedMatch || selectedMatch.stage === "pending") return [];
    return getOtherUserPhotosForLightbox(selectedMatch);
  }, [selectedMatch]);

  /** Current user interests while partner profile drawer is open (same idea as mobile MatchProfileModal). */
  const [drawerProfileInterests, setDrawerProfileInterests] = useState<string[]>([]);

  const partnerDrawerCommonInterests = useMemo(() => {
    if (!selectedMatch || drawerProfileInterests.length === 0) return [];
    const theirs = selectedMatch.otherUser.interests || [];
    if (theirs.length === 0) return [];
    return drawerProfileInterests.filter((mine) =>
      theirs.some((t) => t.toLowerCase() === mine.toLowerCase())
    );
  }, [selectedMatch, drawerProfileInterests]);

  useEffect(() => {
    if (!partnerDrawerOpen || !user) {
      setDrawerProfileInterests([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<unknown>("/profile");
        if (cancelled) return;
        setDrawerProfileInterests(interestsFromProfilePayload(data));
      } catch {
        if (!cancelled) setDrawerProfileInterests([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerDrawerOpen, user]);

  const openMatchThread = useCallback((match: Match) => {
    const clearedMatch = { ...match, unreadCount: 0 };
    setSelectedMatch(clearedMatch);
    setMatches((prev) =>
      prev.map((m) => (m.id === match.id ? { ...m, unreadCount: 0 } : m))
    );
    if (socketRef.current && match.stage !== "pending") {
      socketRef.current.emit("mark_read", { matchId: match.id });
    }
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      setMobileShowMatchList(false);
    }
  }, []);

  useEffect(() => {
    setPartnerDrawerOpen(false);
  }, [selectedMatch?.id]);

  useEffect(() => {
    if (!partnerDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [partnerDrawerOpen]);

  const voiceCanceledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pendingImagePreviewUrl) URL.revokeObjectURL(pendingImagePreviewUrl);
    };
  }, [pendingImagePreviewUrl]);

  const clearPendingImage = useCallback(() => {
    setPendingImageFile(null);
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const clearPendingVideo = useCallback(() => {
    setPendingVideoFile(null);
  }, []);

  const closeLightbox = useCallback(() => setPhotoLightbox(null), []);

  const stepLightbox = useCallback((delta: number) => {
    setPhotoLightbox((prev) => {
      if (!prev || prev.urls.length === 0) return null;
      const n = prev.urls.length;
      if (n === 1) return prev;
      const idx = (prev.index + delta + n * 1000) % n;
      return { ...prev, index: idx };
    });
  }, []);

  const openPhotoLightbox = useCallback((photos: Photo[], startPhoto: Photo) => {
    const sorted = [...photos].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    );
    const urls = sorted.map((p) => getPhotoUrl(p.url)).filter(Boolean);
    if (urls.length === 0) return;
    const idx = sorted.findIndex((p) => p.id === startPhoto.id);
    setPhotoLightbox({ urls, index: idx >= 0 ? idx : 0 });
  }, []);

  useEffect(() => {
    matchesRouteActiveRef.current = true;
    return () => {
      matchesRouteActiveRef.current = false;
      openMatchIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    selectedMatchIdRef.current = selectedMatch?.id ?? null;
    openMatchIdRef.current = selectedMatch?.id ?? null;
  }, [selectedMatch?.id]);

  useEffect(() => {
    selectedMatchStageRef.current = selectedMatch?.stage ?? null;
  }, [selectedMatch?.stage]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!isNarrow) setMobileShowMatchList(true);
  }, [isNarrow]);

  useEffect(() => {
    if (!selectedMatch) setMobileShowMatchList(true);
  }, [selectedMatch]);

  // Initialize WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user) return;

    // Use API URL from environment variable (for production) or ngrok (for testing), otherwise localhost
    const socketUrl = getSocketUrl();
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
      const openId = selectedMatchIdRef.current;
      if (openId) {
        socket.emit('join_match', openId);
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from WebSocket server');
    });

    socket.on('error', (error: { message: string }) => {
      console.error('WebSocket error:', error.message);
      setNotification({
        message: `Error: ${error.message}`,
        type: "error"
      });
    });

    // Handle new messages
    socket.on('new_message', (message: Message & { matchId?: string }) => {
      const openId = selectedMatchIdRef.current;
      if (message.matchId && message.senderId !== user.id) {
        if (message.matchId === openId) {
          setMatches((prev) =>
            prev.map((m) => (m.id === message.matchId ? { ...m, unreadCount: 0 } : m))
          );
          socket.emit("mark_read", { matchId: message.matchId });
        } else {
          setMatches((prev) => {
            const updated = prev.map((m) =>
              m.id === message.matchId
                ? { ...m, unreadCount: (m.unreadCount || 0) + 1 }
                : m
            );
            const target = updated.find((m) => m.id === message.matchId);
            if (!target) return updated;
            return [target, ...updated.filter((m) => m.id !== message.matchId)];
          });
        }
      }
      if (message.matchId && openId && message.matchId !== openId) {
        return;
      }
      setMessages((prev) => {
        // Check if message already exists (avoid duplicates)
        if (prev.some((m) => m.id === message.id)) {
          return prev;
        }
        const updated = [...prev, { ...message, isOwn: message.senderId === user.id }];

        return updated;
      });
    });

    // Handle stage advancement
    socket.on('stage_advanced', (data: { matchId: string; stage: string; message: string; autoAdvanced?: boolean }) => {
      const openId = selectedMatchIdRef.current;
      const stageBefore = selectedMatchStageRef.current;
      const shouldCelebrateGallery =
        data.stage === "stage2" && openId === data.matchId && stageBefore === "stage1";

      setMatches((prev) =>
        prev.map((m) =>
          m.id === data.matchId ? { ...m, stage: data.stage as "stage1" | "stage2" } : m
        )
      );

      if (openId === data.matchId) {
        setSelectedMatch((prev) => (prev ? { ...prev, stage: data.stage as "stage1" | "stage2" } : null));
        const m = matchesRef.current.find((x) => x.id === data.matchId);
        if (m && data.stage === "stage2") {
          void fetchMatchPhotos({ ...m, stage: "stage2" });
        }
        if (shouldCelebrateGallery) {
          triggerGalleryUnlockCelebration(data.matchId);
        } else if (data.autoAdvanced) {
          setNotification({
            message: "🎉 All photos unlocked! You've each sent 3+ messages.",
            type: "success",
          });
        }
      } else if (data.autoAdvanced) {
        setNotification({
          message: "🎉 Photos unlocked in one of your chats! Check it out!",
          type: "success",
        });
      }
    });

    // Handle typing indicators
    socket.on('user_typing', (data: { userId: string; matchId: string; displayName?: string }) => {
      if (selectedMatchIdRef.current === data.matchId && data.userId !== user.id) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
      }
    });

    socket.on('typing_stopped', (data: { userId: string; matchId: string }) => {
      if (selectedMatchIdRef.current === data.matchId) {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
      }
    });

    // Handle read receipts
    socket.on('messages_read', (data: { matchId: string }) => {
      if (selectedMatchIdRef.current === data.matchId) {
        // Update read status for messages sent by current user
        setMessages((prev) =>
          prev.map((msg) =>
            msg.isOwn && !msg.readAt ? { ...msg, readAt: new Date().toISOString() } : msg
          )
        );
      }
    });

    socket.on(
      "message_liked",
      (data: {
        matchId: string;
        messageId: string;
        likedBy: string;
        likerName?: string;
        senderId?: string;
      }) => {
        if (data.matchId !== selectedMatchIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, likedBy: data.likedBy, laughedBy: null, heartEyesBy: null }
              : m
          )
        );
        if (data.senderId === userIdRef.current && data.likerName) {
          setNotification({
            message: `❤️ ${data.likerName} loved your message`,
            type: "info",
          });
        }
      }
    );

    socket.on("message_unliked", (data: { matchId: string; messageId: string }) => {
      if (data.matchId !== selectedMatchIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, likedBy: null } : m))
      );
    });

    socket.on(
      "message_laughed",
      (data: {
        matchId: string;
        messageId: string;
        laughedBy: string;
        laugherName?: string;
        senderId?: string;
      }) => {
        if (data.matchId !== selectedMatchIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, laughedBy: data.laughedBy, likedBy: null, heartEyesBy: null }
              : m
          )
        );
        if (data.senderId === userIdRef.current && data.laugherName) {
          setNotification({
            message: `😂 ${data.laugherName} laughed at your message`,
            type: "info",
          });
        }
      }
    );

    socket.on("message_unlaughed", (data: { matchId: string; messageId: string }) => {
      if (data.matchId !== selectedMatchIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, laughedBy: null } : m))
      );
    });

    socket.on(
      "message_heart_eyes",
      (data: {
        matchId: string;
        messageId: string;
        heartEyesBy: string;
        reactorName?: string;
        senderId?: string;
      }) => {
        if (data.matchId !== selectedMatchIdRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, heartEyesBy: data.heartEyesBy, likedBy: null, laughedBy: null }
              : m
          )
        );
        if (data.senderId === userIdRef.current && data.reactorName) {
          setNotification({
            message: `😍 ${data.reactorName} reacted to your message`,
            type: "info",
          });
        }
      }
    );

    socket.on("message_unheart_eyes", (data: { matchId: string; messageId: string }) => {
      if (data.matchId !== selectedMatchIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, heartEyesBy: null } : m))
      );
    });

    // Handle new match notification
    socket.on('new_match', (data: { matchId: string; otherUserId: string; otherUserName: string; message: string; stage: string }) => {
      console.log('🎉 New match notification received:', data);
      
      // Show notification
      setNotification({
        message: data.message,
        type: "success"
      });
      
      // Refresh matches list to include the new match
      fetchMatches();
    });

    socket.on(
      "partner_profile_updated",
      (_data: { matchId: string; updatedUserId: string }) => {
        void fetchMatches();
      }
    );

    // Handle reveal request from other user
    socket.on('reveal_requested', (data: { matchId: string; fromUserId: string; fromUserName: string }) => {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === data.matchId ? { ...m, otherWantsReveal: true } : m
        )
      );
      if (selectedMatch?.id === data.matchId) {
        setSelectedMatch((prev) => (prev ? { ...prev, otherWantsReveal: true } : null));
      }
    });

    // Handle reveal request confirmation
    socket.on('reveal_request_sent', (data: { matchId: string; message: string }) => {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === data.matchId ? { ...m, userWantsReveal: true } : m
        )
      );
      if (selectedMatch?.id === data.matchId) {
        setSelectedMatch((prev) => (prev ? { ...prev, userWantsReveal: true } : null));
      }
    });

    socket.on(
      "game_request_received",
      (data: {
        requestId: string;
        matchId: string;
        fromUserId: string;
        fromUserName: string;
        gameType: "truth_or_dare" | "never_have_i_ever";
      }) => {
        setGameRequestToShow({
          requestId: data.requestId,
          matchId: data.matchId,
          fromUserId: data.fromUserId,
          fromUserName: data.fromUserName,
          gameType: data.gameType,
        });
        const m = matchesRef.current.find((x) => x.id === data.matchId);
        if (m) openMatchThread(m);
      }
    );

    socket.on(
      "game_request_responded",
      (data: { requestId: string; matchId: string; gameType: string; accepted: boolean }) => {
        if (!data.accepted) return;
        const m = matchesRef.current.find((x) => x.id === data.matchId);
        if (m) {
          openMatchThread(m);
          if (data.gameType === "truth_or_dare" || data.gameType === "never_have_i_ever") {
            setOpenGameForAccept({
              matchId: data.matchId,
              gameType: data.gameType,
            });
          }
        }
      }
    );

    socket.on("game_unlocked", (data: { matchId: string; gameType: string }) => {
      const key =
        data.gameType === "truth_or_dare" ? ("truth_or_dare" as const) : ("never_have_i_ever" as const);
      setMatches((prev) =>
        prev.map((m) =>
          m.id === data.matchId
            ? {
                ...m,
                gameUnlocks: {
                  ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
                  [key]: true,
                },
              }
            : m
        )
      );
      setSelectedMatch((prev) => {
        if (!prev || prev.id !== data.matchId) return prev;
        return {
          ...prev,
          gameUnlocks: {
            ...(prev.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
            [key]: true,
          },
        };
      });
    });

    socket.on(
      "compatibility_score_updated",
      (data: {
        matchId: string;
        score: number;
        engagementLevel?: "cold" | "neutral" | "warming" | "hot";
      }) => {
        const mid = data.matchId;
        const rounded = Math.round(Number(data.score));
        if (Number.isNaN(rounded)) return;
        setMatches((prev) =>
          prev.map((m) => (m.id === mid ? { ...m, compatibilityScore: rounded } : m))
        );
        if (selectedMatchIdRef.current !== mid) return;
        setSelectedMatch((prev) =>
          prev && prev.id === mid ? { ...prev, compatibilityScore: rounded } : prev
        );
        setPulseScore(rounded);
        const el = data.engagementLevel;
        setPulseEngagement(
          el === "cold" || el === "neutral" || el === "warming" || el === "hot" ? el : null
        );
      }
    );

    return () => {
      socket.disconnect();
    };
  }, [user, triggerGalleryUnlockCelebration]);

  // Fetch matches on component mount
  useEffect(() => {
    fetchMatches();
  }, []);

  // Open a specific thread when arriving from match celebration (Browse → Send a Message)
  useEffect(() => {
    if (loading) return;
    const state = location.state as { openMatchId?: string } | null | undefined;
    const id = state?.openMatchId;
    if (!id) return;
    if (matches.length === 0) return;
    const m = matches.find((x) => x.id === id);
    if (m) openMatchThread(m);
    navigate(location.pathname, { replace: true, state: {} });
  }, [loading, matches, location.state, location.pathname, navigate, openMatchThread]);

  // Join/leave match room when selected match changes
  useEffect(() => {
    if (!socketRef.current || !selectedMatch) return;

    if (selectedMatch.stage !== "pending") {
      // Join match room
      socketRef.current.emit('join_match', selectedMatch.id);
      
      // Fetch initial messages
      fetchMessages(selectedMatch.id);
      
      // Fetch photos if in stage2 and list missing or empty (server may send full set; avoid redundant /photos overwrite)
      if (selectedMatch.stage === "stage2" && !selectedMatch.otherUser.photos?.length) {
        fetchMatchPhotos(selectedMatch);
      }

      // Mark messages as read
      socketRef.current.emit('mark_read', { matchId: selectedMatch.id });
    }

    return () => {
      if (socketRef.current && selectedMatch) {
        socketRef.current.emit('leave_match', selectedMatch.id);
      }
    };
  }, [selectedMatch?.id]);

  const fetchMatchPhotos = async (match: Match) => {
    if (!match.otherUser.profileId) return;
    try {
      const photosData = await api.get<{ photos: Photo[] }>(`/photos/profile/${match.otherUser.profileId}`);
      setMatches(prev => prev.map(m => 
        m.id === match.id 
          ? { ...m, otherUser: { ...m.otherUser, photos: photosData.photos } }
          : m
      ));
      setSelectedMatch((prev) =>
        prev?.id === match.id
          ? { ...prev, otherUser: { ...prev.otherUser, photos: photosData.photos } }
          : prev
      );
    } catch {
      // Photos might not exist
    }
  };

  const scrollMessagesToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  const clearMobileChatKeyboardInset = useCallback(() => {
    document.body.classList.remove("matches-chat-keyboard-open");
    document.body.style.removeProperty("--chat-keyboard-inset");
  }, []);

  const syncMobileChatKeyboardInset = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth > 900) return;
    const activeEl = document.activeElement;
    const composerFocused =
      !!activeEl &&
      (activeEl === messageInputRef.current ||
        (messageComposerRef.current != null && messageComposerRef.current.contains(activeEl)));
    if (!composerFocused) {
      clearMobileChatKeyboardInset();
    }
  }, [clearMobileChatKeyboardInset]);

  /** Keep the message field + Send above the tab bar after iOS keyboard dismiss (Done/checkmark). */
  const ensureMobileComposerVisible = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth > 900) return;
    clearMobileChatKeyboardInset();

    const pinComposer = () => {
      const composer = messageComposerRef.current;
      if (!composer) return;

      const messageInput = messageInputRef.current;
      const sendBtn = composer.querySelector<HTMLElement>(".send-btn");
      const target = messageInput ?? sendBtn ?? composer;
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const tabReserve =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue("--native-tab-height") || "48",
          10
        ) +
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue("--native-tab-safe-bottom") || "10",
          10
        ) +
        8;

      const rect = target.getBoundingClientRect();
      const overflow = rect.bottom + tabReserve - visibleBottom;
      if (overflow > 1) {
        window.scrollBy({ top: overflow, left: 0, behavior: "instant" });
      }

      const after = target.getBoundingClientRect();
      if (after.bottom + tabReserve > visibleBottom) {
        composer.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" });
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(pinComposer);
      setTimeout(pinComposer, 60);
      setTimeout(pinComposer, 180);
    });
  }, [clearMobileChatKeyboardInset]);

  const resetMobileChatViewport = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth > 900) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelector(".main-content")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    clearMobileChatKeyboardInset();
  }, [clearMobileChatKeyboardInset]);

  const stabilizeMobileChatLayout = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth > 900) return;
    resetMobileChatViewport();
    const pinComposer = () => {
      messageComposerRef.current?.scrollIntoView({ block: "end", inline: "nearest", behavior: "instant" });
      scrollMessagesToEnd("auto");
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(pinComposer);
    });
  }, [resetMobileChatViewport, scrollMessagesToEnd]);

  const mobileChatOpen = isNarrow && !!selectedMatch && !mobileShowMatchList;

  useEffect(() => {
    if (!mobileChatOpen) {
      document.body.classList.remove("matches-mobile-chat-open");
      return;
    }
    document.body.classList.add("matches-mobile-chat-open");
    return () => {
      document.body.classList.remove("matches-mobile-chat-open");
    };
  }, [mobileChatOpen]);

  useEffect(() => {
    if (!selectedMatch || selectedMatch.stage === "pending") return;
    scrollMessagesToEnd(messages.length > 0 ? "smooth" : "auto");
  }, [messages, selectedMatch?.id, selectedMatch?.stage, scrollMessagesToEnd]);

  useLayoutEffect(() => {
    if (!mobileChatOpen) return;
    stabilizeMobileChatLayout();
  }, [mobileChatOpen, selectedMatch?.id, messages.length, stabilizeMobileChatLayout]);

  useEffect(() => {
    if (!mobileChatOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewportChange = () => {
      syncMobileChatKeyboardInset();
      const keyboardLikelyClosed = vv.height >= window.innerHeight * 0.92;
      if (!keyboardLikelyClosed) return;
      if (document.activeElement === messageInputRef.current) return;
      ensureMobileComposerVisible();
    };
    syncMobileChatKeyboardInset();
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
    return () => {
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
      clearMobileChatKeyboardInset();
    };
  }, [
    mobileChatOpen,
    syncMobileChatKeyboardInset,
    ensureMobileComposerVisible,
    clearMobileChatKeyboardInset,
  ]);

  useEffect(() => {
    if (!photoLightbox && !partnerDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (photoLightbox) closeLightbox();
        else setPartnerDrawerOpen(false);
        return;
      }
      if (!photoLightbox) return;
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoLightbox, partnerDrawerOpen, closeLightbox, stepLightbox]);

  const fetchMatches = async (): Promise<Match[]> => {
    try {
      const data = await api.get<{ matches: Match[] }>("/matches");
      // Fetch photos for each match in stage2
      const matchesWithPhotos = await Promise.all(
        data.matches.map(async (match) => {
          if (match.stage === "stage2" && match.otherUser.profileId) {
            // GET /matches already includes full `photos` for stage2 — only refetch if absent/empty
            if (match.otherUser.photos && match.otherUser.photos.length > 0) {
              return match;
            }
            try {
              const photosData = await api.get<{ photos: Photo[] }>(
                `/photos/profile/${match.otherUser.profileId}`
              );
              match.otherUser.photos = photosData.photos;
            } catch {
              match.otherUser.photos = [];
            }
          }
          return match;
        })
      );
      setMatches(matchesWithPhotos);
      return matchesWithPhotos;
    } catch (error) {
      console.error("Failed to fetch matches:", error);
      // Set empty matches array on error
      setMatches([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedMatch?.id || matches.length === 0) return;
    const updated = matches.find((m) => m.id === selectedMatch.id);
    if (!updated) return;
    setSelectedMatch(updated);
  }, [matches, selectedMatch?.id]);

  const fetchMessages = async (matchId: string) => {
    try {
      const data = await api.get<{ messages: Message[] }>(
        `/matches/${matchId}/messages`
      );
      if (selectedMatchIdRef.current !== matchId) return;

      setMessages(data.messages);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  useEffect(() => {
    setShowPulseCompatModal(false);
  }, [selectedMatch?.id]);

  // Profile interest % + compatibility pulse (same APIs as mobile); sidebar uses GET /matches until this refreshes
  useEffect(() => {
    if (!selectedMatch || selectedMatch.stage === "pending") {
      setLiveProfileCompatibility(null);
      setCompatibilityDetails(null);
      setPulseScore(null);
      setPulseEngagement(null);
      return;
    }
    const id = selectedMatch.id;
    const seedProfile = selectedMatch.profileCompatibility;
    if (typeof seedProfile === "number") {
      setLiveProfileCompatibility(seedProfile);
    } else {
      setLiveProfileCompatibility(null);
    }
    const seedPulse = selectedMatch.compatibilityScore;
    setPulseScore(typeof seedPulse === "number" ? Math.round(seedPulse) : null);

    let cancelled = false;
    void (async () => {
      try {
        const [prof, pulseRes] = await Promise.all([
          api.get<{
            profileCompatibility?: number;
            reasons?: string[];
            sharedInterests?: string[];
          }>(`/matches/${id}/profile-compatibility`),
          api.get<{ score?: { score: number; engagementLevel?: string } }>(`/matches/${id}/compatibility`),
        ]);
        if (cancelled) return;

        const val = prof.profileCompatibility;
        if (typeof val === "number") {
          setLiveProfileCompatibility(val);
          setCompatibilityDetails({
            reasons: filterInterestCompatReasons(Array.isArray(prof.reasons) ? prof.reasons : []),
            sharedInterests: Array.isArray(prof.sharedInterests) ? prof.sharedInterests : [],
          });
          setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, profileCompatibility: val } : m)));
          setSelectedMatch((prev) => (prev && prev.id === id ? { ...prev, profileCompatibility: val } : prev));
        } else {
          setLiveProfileCompatibility(null);
          setCompatibilityDetails(null);
        }

        const pulse = pulseRes.score;
        if (pulse && typeof pulse.score === "number") {
          const rounded = Math.round(pulse.score);
          setPulseScore(rounded);
          const el = pulse.engagementLevel;
          setPulseEngagement(
            el === "cold" || el === "neutral" || el === "warming" || el === "hot" ? el : null
          );
          setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, compatibilityScore: rounded } : m)));
          setSelectedMatch((prev) =>
            prev && prev.id === id ? { ...prev, compatibilityScore: rounded } : prev
          );
        }
      } catch {
        if (!cancelled) {
          setCompatibilityDetails(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedMatch?.id, selectedMatch?.stage]);

  const toggleMessageLove = async (messageId: string, currentlyLiked: boolean) => {
    const matchId = selectedMatchIdRef.current;
    const uid = userIdRef.current;
    if (!matchId || !uid) return;
    setReactionBusyMessageId(messageId);
    try {
      if (currentlyLiked) {
        await api.delete(`/matches/${matchId}/messages/${messageId}/like`);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, likedBy: null } : m))
        );
      } else {
        await api.post(`/matches/${matchId}/messages/${messageId}/like`, {});
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, likedBy: uid, laughedBy: null, heartEyesBy: null } : m
          )
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not update heart reaction";
      setNotification({ message: msg, type: "error" });
      await fetchMessages(matchId);
    } finally {
      setReactionBusyMessageId(null);
    }
  };

  const toggleMessageLaugh = async (messageId: string, currentlyLaughed: boolean) => {
    const matchId = selectedMatchIdRef.current;
    const uid = userIdRef.current;
    if (!matchId || !uid) return;
    setReactionBusyMessageId(messageId);
    try {
      if (currentlyLaughed) {
        await api.delete(`/matches/${matchId}/messages/${messageId}/laugh`);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, laughedBy: null } : m))
        );
      } else {
        await api.post(`/matches/${matchId}/messages/${messageId}/laugh`, {});
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, laughedBy: uid, likedBy: null, heartEyesBy: null } : m
          )
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not update laugh reaction";
      setNotification({ message: msg, type: "error" });
      await fetchMessages(matchId);
    } finally {
      setReactionBusyMessageId(null);
    }
  };

  const toggleMessageHeartEyes = async (messageId: string, currentlyHeartEyes: boolean) => {
    const matchId = selectedMatchIdRef.current;
    const uid = userIdRef.current;
    if (!matchId || !uid) return;
    setReactionBusyMessageId(messageId);
    try {
      if (currentlyHeartEyes) {
        await api.delete(`/matches/${matchId}/messages/${messageId}/heart-eyes`);
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, heartEyesBy: null } : m))
        );
      } else {
        await api.post(`/matches/${matchId}/messages/${messageId}/heart-eyes`, {});
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, heartEyesBy: uid, likedBy: null, laughedBy: null } : m
          )
        );
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not update heart-eyes reaction";
      setNotification({ message: msg, type: "error" });
      await fetchMessages(matchId);
    } finally {
      setReactionBusyMessageId(null);
    }
  };

  const stopTypingForSend = (matchId: string) => {
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socketRef.current?.emit("stop_typing", { matchId });
  };

  const onMessageSentSuccess = (
    data: { message: Message; autoAdvanced?: boolean; stage?: string },
    matchId: string,
    snap: Match | null
  ) => {
    setMessages((prev) => {
      const m = data.message;
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, { ...m, isOwn: true }];
    });
    void fetchMessages(matchId);
    if (data.autoAdvanced && data.stage === "stage2" && snap) {
      const wasStage1 = snap.stage === "stage1";
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, stage: "stage2" as const } : m))
      );
      setSelectedMatch((prev) =>
        prev && prev.id === matchId ? { ...prev, stage: "stage2" as const } : prev
      );
      if (wasStage1) {
        triggerGalleryUnlockCelebration(matchId);
      } else {
        setNotification({
          message: "🎉 All photos unlocked! You've each sent 3+ messages.",
          type: "success",
        });
      }
      const matchForPhotos = { ...snap, id: matchId, stage: "stage2" as const };
      fetchMatchPhotos(matchForPhotos);
    }
    if (typeof window !== "undefined" && window.innerWidth <= 900) {
      messageInputRef.current?.blur();
      ensureMobileComposerVisible();
      requestAnimationFrame(() => scrollMessagesToEnd("auto"));
    }
  };

  const requireChatMediaUnlocked = (kind: ChatMediaKind): boolean => {
    if (chatMediaUnlocked) return true;
    setChatMediaModal({ variant: "locked", kind });
    return false;
  };

  function pickVoiceMimeType(): string | undefined {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  }

  const cancelVoiceRecording = useCallback(() => {
    voiceCanceledRef.current = true;
    const mr = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    voiceChunksRef.current = [];
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsRecordingVoice(false);
  }, []);

  /** Starts mic capture + upload (called after unlock + optional guidelines modal). */
  const beginVoiceRecordingSession = async () => {
    if (!selectedMatch || !user) return;
    if (sendingMessage || uploadingImage || uploadingVideo || uploadingAudio || isRecordingVoice) return;
    if (pendingImageFile || pendingVideoFile) {
      setNotification({
        message: "Send or clear your photo or video attachment first.",
        type: "warning",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      voiceChunksRef.current = [];
      voiceCanceledRef.current = false;
      const mime = pickVoiceMimeType();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };
      rec.addEventListener("stop", () => {
        void (async () => {
          stream.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
          mediaRecorderRef.current = null;
          setIsRecordingVoice(false);
          const canceled = voiceCanceledRef.current;
          voiceCanceledRef.current = false;
          const chunks = voiceChunksRef.current;
          voiceChunksRef.current = [];
          if (canceled || !chunks.length) return;
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          if (!blob.size) return;
          const matchIdNow = selectedMatchIdRef.current;
          if (!matchIdNow) return;
          const isMp4ish = blob.type.includes("mp4");
          const name = isMp4ish ? "voice.m4a" : "voice.webm";
          const file = new File([blob], name, {
            type: isMp4ish ? "audio/mp4" : blob.type || "audio/webm",
          });
          setUploadingAudio(true);
          try {
            const fd = new FormData();
            fd.append("audio", file);
            const { audioUrl } = await api.postForm<{ audioUrl: string }>(
              `/matches/${matchIdNow}/messages/upload-audio`,
              fd
            );
            if (!audioUrl) throw new Error("No audio URL returned");
            stopTypingForSend(matchIdNow);
            const snap = matchesRef.current.find((m) => m.id === matchIdNow) ?? null;
            const data = await api.post<{
              message: Message;
              autoAdvanced?: boolean;
              stage?: string;
            }>(`/matches/${matchIdNow}/messages`, { audioUrl });
            onMessageSentSuccess(data, matchIdNow, snap);
          } catch (error) {
            console.error("Voice send failed:", error);
            const msg =
              error instanceof ApiError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : "Failed to send voice message.";
            setNotification({ message: msg, type: "error" });
          } finally {
            setUploadingAudio(false);
          }
        })();
      });
      mediaRecorderRef.current = rec;
      rec.start(200);
      setIsRecordingVoice(true);
    } catch {
      setNotification({
        message: "Microphone access is required to record a voice message.",
        type: "error",
      });
    }
  };

  /** Mic button: unlock check → guidelines modal when unlocked → recording after Got it. */
  const startVoiceRecording = () => {
    if (!selectedMatch || !user) return;
    if (!requireChatMediaUnlocked("voice")) return;
    if (sendingMessage || uploadingImage || uploadingVideo || uploadingAudio || isRecordingVoice) return;
    if (pendingImageFile || pendingVideoFile) {
      setNotification({
        message: "Send or clear your photo or video attachment first.",
        type: "warning",
      });
      return;
    }
    setChatMediaModal({ variant: "guidelines", kind: "voice" });
  };

  const onChatMediaModalPrimary = () => {
    const state = chatMediaModal;
    setChatMediaModal(null);
    if (!state) return;
    if (state.variant === "locked") return;
    if (state.kind === "image") imageFileInputRef.current?.click();
    else if (state.kind === "video") videoFileInputRef.current?.click();
    else if (state.kind === "voice") void beginVoiceRecordingSession();
  };

  const onChatMediaModalDismiss = () => {
    setChatMediaModal(null);
  };

  const openReportForMatch = (match: Match, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (match.stage === "pending") return;
    setPartnerDrawerOpen(false);
    setReportTarget({
      matchId: match.id,
      reportedUserId: match.otherUser.userId,
      displayName: match.otherUser.displayName,
    });
    setReportModalOpen(true);
  };

  const finishVoiceRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      voiceCanceledRef.current = false;
      mr.stop();
    }
  };

  const uploadChatImageAndSend = async (file: File) => {
    if (!selectedMatch) return;
    const matchId = selectedMatch.id;
    const snap = selectedMatch;
    setUploadingImage(true);
    const caption = newMessage.trim();
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { imageUrl } = await api.postForm<{ imageUrl: string }>(
        `/matches/${matchId}/messages/upload-image`,
        fd
      );
      if (!imageUrl) throw new Error("No image URL returned");
      stopTypingForSend(matchId);
      const body: Record<string, string> = { imageUrl };
      if (caption) body.content = caption;
      const data = await api.post<{
        message: Message;
        autoAdvanced?: boolean;
        stage?: string;
      }>(`/matches/${matchId}/messages`, body);
      clearMessageDraftForMatch(matchId);
      setNewMessage("");
      clearPendingImage();
      onMessageSentSuccess(data, matchId, snap);
    } catch (error) {
      console.error("Image send failed:", error);
      const msg =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to send photo.";
      setNotification({ message: msg, type: "error" });
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadChatVideoAndSend = async (file: File) => {
    if (!selectedMatch) return;
    const matchId = selectedMatch.id;
    const snap = selectedMatch;
    setUploadingVideo(true);
    const caption = newMessage.trim();
    try {
      const fd = new FormData();
      fd.append("video", file);
      const { videoUrl } = await api.postForm<{ videoUrl: string }>(
        `/matches/${matchId}/messages/upload-video`,
        fd
      );
      if (!videoUrl) throw new Error("No video URL returned");
      stopTypingForSend(matchId);
      const body: Record<string, string> = { videoUrl };
      if (caption) body.content = caption;
      const data = await api.post<{
        message: Message;
        autoAdvanced?: boolean;
        stage?: string;
      }>(`/matches/${matchId}/messages`, body);
      clearMessageDraftForMatch(matchId);
      setNewMessage("");
      clearPendingVideo();
      onMessageSentSuccess(data, matchId, snap);
    } catch (error) {
      console.error("Video send failed:", error);
      const msg =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to send video. Use MP4 or MOV.";
      setNotification({ message: msg, type: "error" });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedMatch || sendingMessage) return;
    if (uploadingImage || uploadingVideo || uploadingAudio) return;
    const matchId = selectedMatch.id;
    const snap = selectedMatch;

    if (pendingImageFile) {
      if (!requireChatMediaUnlocked("image")) return;
      await uploadChatImageAndSend(pendingImageFile);
      return;
    }
    if (pendingVideoFile) {
      if (!requireChatMediaUnlocked("video")) return;
      await uploadChatVideoAndSend(pendingVideoFile);
      return;
    }
    if (!newMessage.trim()) return;

    const messageContent = newMessage.trim();
    clearMessageDraftForMatch(matchId);
    setNewMessage("");
    stopTypingForSend(matchId);
    setSendingMessage(true);
    try {
      const data = await api.post<{
        message: Message;
        autoAdvanced?: boolean;
        stage?: string;
      }>(`/matches/${matchId}/messages`, { content: messageContent });
      onMessageSentSuccess(data, matchId, snap);
    } catch (error) {
      console.error("Failed to send message:", error);
      messageDraftsRef.current[matchId] = messageContent;
      composerTextRef.current = messageContent;
      setNewMessage(messageContent);
      const msg =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to send message. Please try again.";
      setNotification({ message: msg, type: "error" });
    } finally {
      setSendingMessage(false);
    }
  };

  /** Send a fixed string (e.g. Truth or Dare prompt) without using the message input field. Returns whether send succeeded. */
  const sendChatText = async (messageContent: string): Promise<boolean> => {
    const trimmed = messageContent.trim();
    if (!trimmed || !selectedMatch || sendingMessage) return false;
    const matchId = selectedMatch.id;
    const snap = selectedMatch;
    stopTypingForSend(matchId);
    setSendingMessage(true);
    try {
      const data = await api.post<{
        message: Message;
        autoAdvanced?: boolean;
        stage?: string;
      }>(`/matches/${matchId}/messages`, { content: trimmed });
      onMessageSentSuccess(data, matchId, snap);
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      const msg =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to send message. Please try again.";
      setNotification({ message: msg, type: "error" });
      return false;
    } finally {
      setSendingMessage(false);
    }
  };

  const clearComposerExtras = useCallback(() => {
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    clearPendingImage();
    clearPendingVideo();
    cancelVoiceRecording();
    setChatMediaModal(null);
  }, [clearPendingImage, clearPendingVideo, cancelVoiceRecording]);

  useEffect(() => {
    composerTextRef.current = newMessage;
  }, [newMessage]);

  useLayoutEffect(() => {
    const nextId = selectedMatch?.id ?? null;
    const prevId = composerMatchIdRef.current;
    if (prevId === nextId) return;

    if (prevId) {
      messageDraftsRef.current[prevId] = composerTextRef.current;
    }

    composerMatchIdRef.current = nextId;
    clearComposerExtras();

    const restored = nextId ? (messageDraftsRef.current[nextId] ?? "") : "";
    composerTextRef.current = restored;
    setNewMessage(restored);
  }, [selectedMatch?.id, clearComposerExtras]);

  const clearMessageDraftForMatch = useCallback((matchId: string) => {
    delete messageDraftsRef.current[matchId];
  }, []);

  useEffect(() => {
    return () => {
      const leavingId = selectedMatchIdRef.current;
      if (leavingId && socketRef.current) {
        socketRef.current.emit("stop_typing", { matchId: leavingId });
      }
    };
  }, [selectedMatch?.id]);

  const openImagePicker = () => {
    if (sendingMessage || uploadingImage || uploadingVideo || uploadingAudio || isRecordingVoice) return;
    if (!requireChatMediaUnlocked("image")) return;
    setChatMediaModal({ variant: "guidelines", kind: "image" });
  };

  const openVideoPicker = () => {
    if (sendingMessage || uploadingImage || uploadingVideo || uploadingAudio || isRecordingVoice) return;
    if (!requireChatMediaUnlocked("video")) return;
    setChatMediaModal({ variant: "guidelines", kind: "video" });
  };

  const onImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    clearPendingVideo();
    setPendingImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setPendingImageFile(f);
  };

  const onVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    clearPendingImage();
    setPendingVideoFile(f);
  };

  // Handle typing indicator
  const handleTyping = () => {
    if (!selectedMatch || !socketRef.current || !newMessage.trim()) {
      if (isTyping) {
        socketRef.current?.emit('stop_typing', { matchId: selectedMatch?.id });
        setIsTyping(false);
      }
      return;
    }

    if (!isTyping) {
      socketRef.current.emit('typing', { matchId: selectedMatch.id });
      setIsTyping(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('stop_typing', { matchId: selectedMatch.id });
      setIsTyping(false);
    }, 3000);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleRevealPhotos = async () => {
    if (!selectedMatch) return;

    // Confirm with user
    if (!confirm("Are you sure you want to reveal all photos now? This will bypass the automatic reveal (which happens after each of you sends 3 messages).")) {
      return;
    }

    try {
      // Call REST endpoint to manually reveal
      await api.post(`/matches/${selectedMatch.id}/reveal`, {});
      
      // Update match stage immediately
      setSelectedMatch((prev) => (prev ? { ...prev, stage: "stage2" as const } : null));
      setMatches((prev) =>
        prev.map((m) =>
          m.id === selectedMatch.id ? { ...m, stage: "stage2" as const } : m
        )
      );

      // Fetch photos for stage2
      if (selectedMatch.otherUser.profileId) {
        try {
          const photosData = await api.get<{ photos: Photo[] }>(`/photos/profile/${selectedMatch.otherUser.profileId}`);
          setSelectedMatch((prev) => 
            prev ? { ...prev, otherUser: { ...prev.otherUser, photos: photosData.photos } } : null
          );
        } catch {
          // Photos might not exist
        }
      }

      // Emit socket event to notify other user
      if (socketRef.current) {
        socketRef.current.emit('request_reveal', { matchId: selectedMatch.id });
      }
    } catch (error) {
      console.error('Failed to reveal photos:', error);
      alert('Failed to reveal photos. Please try again.');
    }
  };

  const handleUnmatchClick = () => {
    if (!selectedMatch) return;
    setShowUnmatchConfirm(true);
  };

  const handleUnmatchConfirm = async () => {
    if (!selectedMatch) return;
    
    setShowUnmatchConfirm(false);
    const matchName = selectedMatch.otherUser.displayName;

    try {
      await api.delete(`/matches/${selectedMatch.id}`);
      setSelectedMatch(null);
      await fetchMatches();
      setNotification({
        message: `You removed the chat with ${matchName}`,
        type: "info"
      });
    } catch (error) {
      setNotification({
        message: "Couldn’t remove that chat. Please try again.",
        type: "error"
      });
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "pending":
        return "Waiting...";
      case "stage1":
        return "1 photo";
      case "stage2":
        return "All photos";
      default:
        return stage;
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "pending":
        return "stage-pending";
      case "stage1":
        return "stage-1";
      case "stage2":
        return "stage-2";
      default:
        return "";
    }
  };

  const getDaysRemaining = (expiresAt: string | null): number | null => {
    if (!expiresAt) return null;
    const expirationDate = new Date(expiresAt);
    const now = new Date();
    
    // Set both dates to midnight to avoid time-of-day issues
    const expirationMidnight = new Date(expirationDate.getFullYear(), expirationDate.getMonth(), expirationDate.getDate());
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffMs = expirationMidnight.getTime() - nowMidnight.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    // If it's the same day or less than 0, return 0 (expires today)
    return diffDays > 0 ? diffDays : 0;
  };

  if (loading) {
    return (
      <div className="matches-native-loading native-app-screen" aria-busy="true">
        <div className="loading-screen">Loading your matches...</div>
      </div>
    );
  }

  return (
    <div
      className={`matches-page native-app-screen${
        mobileChatOpen ? " matches-page--mobile-conversation matches-page--compact-chat" : ""
      }`}
    >
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
          duration={notification.duration ?? 6000}
        />
      )}
      <PhotoGalleryUnlockCelebration open={galleryUnlockCelebrationOpen} onDismiss={dismissGalleryUnlockCelebration} />
      {photoUnlockExplainerOpen && selectedMatch?.stage === "stage1" ? (
        <PhotoUnlockExplainerModalWeb
          open
          onClose={() => setPhotoUnlockExplainerOpen(false)}
          partnerDisplayName={selectedMatch.otherUser.displayName}
        />
      ) : null}
      {showUnmatchConfirm && selectedMatch && (
        <ConfirmModal
          isOpen={showUnmatchConfirm}
          title="Unmatch?"
          message={`Are you sure you want to unmatch with ${selectedMatch.otherUser.displayName}? This cannot be undone and you will lose all messages.`}
          confirmText="Yes, Unmatch"
          cancelText="Cancel"
          onConfirm={handleUnmatchConfirm}
          onCancel={() => setShowUnmatchConfirm(false)}
          type="danger"
        />
      )}
      {chatMediaModal ? (
        <ChatMediaModerationModal
          open
          variant={chatMediaModal.variant}
          mediaKind={chatMediaModal.kind}
          moderationWarning={CHAT_MEDIA_MODERATION_WARNING}
          lockedHint={CHAT_MEDIA_LOCKED_HINT}
          lockedProgress={
            chatMediaModal.variant === "locked"
              ? { ...chatMediaMessageCounts, threshold: 3 }
              : undefined
          }
          onConfirm={onChatMediaModalPrimary}
          onCancel={onChatMediaModalDismiss}
        />
      ) : null}
      {reportModalOpen && reportTarget ? (
        <ReportUserModal
          open
          reportedUserId={reportTarget.reportedUserId}
          matchId={reportTarget.matchId}
          reportedDisplayName={reportTarget.displayName}
          onClose={() => {
            setReportModalOpen(false);
            setReportTarget(null);
          }}
          onSubmitted={() => {
            setNotification({ message: "Thanks — we'll look into it.", type: "success" });
          }}
        />
      ) : null}
      <InterestCompatibilityModal
        open={showInterestCompatModal}
        profileCompatibility={
          liveProfileCompatibility ?? selectedMatch?.profileCompatibility ?? null
        }
        reasons={compatibilityDetails?.reasons ?? []}
        sharedInterests={compatibilityDetails?.sharedInterests ?? []}
        onClose={() => setShowInterestCompatModal(false)}
      />
      {showPulseCompatModal &&
      selectedMatch &&
      (pulseScore != null ||
        (typeof selectedMatch.compatibilityScore === "number" &&
          !Number.isNaN(selectedMatch.compatibilityScore))) ? (
        <CompatibilityPulseModal
          open
          score={pulseScore ?? Math.round(selectedMatch.compatibilityScore as number)}
          engagement={pulseEngagement}
          onClose={() => setShowPulseCompatModal(false)}
        />
      ) : null}
      <GameRequestModalWeb
        request={gameRequestToShow}
        onClose={() => setGameRequestToShow(null)}
        onAccepted={(matchId, gameType) => {
          setGameRequestToShow(null);
          const gameKey =
            gameType === "truth_or_dare" ? ("truth_or_dare" as const) : ("never_have_i_ever" as const);
          const m = matches.find((x) => x.id === matchId);
          if (m) {
            const updated: Match = {
              ...m,
              gameUnlocks: {
                ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
                [gameKey]: true,
              },
            };
            openMatchThread(updated);
            setMatches((prev) => prev.map((x) => (x.id === matchId ? updated : x)));
          }
          if (gameType === "truth_or_dare") {
            setOpenGameForAccept({ matchId, gameType: "truth_or_dare" });
          } else {
            setNotification({
              message: "Never Have I Ever is available in the mobile app for full play.",
              type: "info",
            });
          }
        }}
      />

      {photoLightbox &&
        photoLightbox.urls.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`match-photo-lightbox${
              partnerDrawerOpen ? " match-photo-lightbox--over-sheet" : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${photoLightbox.index + 1} of ${photoLightbox.urls.length}`}
            onClick={closeLightbox}
          >
            <button
              type="button"
              className="match-photo-lightbox-close"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                closeLightbox();
              }}
            >
              ×
            </button>
            {photoLightbox.urls.length > 1 && (
              <button
                type="button"
                className="match-photo-lightbox-nav match-photo-lightbox-nav--prev"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  stepLightbox(-1);
                }}
              >
                ‹
              </button>
            )}
            {photoLightbox.urls.length > 1 && (
              <button
                type="button"
                className="match-photo-lightbox-nav match-photo-lightbox-nav--next"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  stepLightbox(1);
                }}
              >
                ›
              </button>
            )}
            <div
              className="match-photo-lightbox-center"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => {
                lightboxTouchX.current = e.changedTouches[0].clientX;
              }}
              onTouchEnd={(e) => {
                const start = lightboxTouchX.current;
                lightboxTouchX.current = null;
                if (start == null) return;
                const dx = e.changedTouches[0].clientX - start;
                if (dx > 56) stepLightbox(-1);
                else if (dx < -56) stepLightbox(1);
              }}
            >
              <img
                src={photoLightbox.urls[photoLightbox.index]}
                alt=""
                className="match-photo-lightbox-img"
              />
              {photoLightbox.urls.length > 1 && (
                <div className="match-photo-lightbox-counter">
                  {photoLightbox.index + 1} / {photoLightbox.urls.length}
                </div>
              )}
              {photoLightbox.urls.length > 1 ? (
                <p className="match-photo-lightbox-browse-hint">
                  Swipe or tap ‹ › · cycles through every unlocked photo
                </p>
              ) : null}
            </div>
          </div>,
          document.body
        )}
      <MatchPartnerProfileSheet
        open={
          partnerDrawerOpen &&
          !!selectedMatch &&
          selectedMatch.stage !== "pending"
        }
        onClose={() => setPartnerDrawerOpen(false)}
        stage={selectedMatch?.stage === "stage2" ? "stage2" : "stage1"}
        photos={selectedMatchPhotos}
        otherUser={{
          displayName: selectedMatch?.otherUser.displayName ?? "",
          age: selectedMatch?.otherUser.age,
          gender: selectedMatch?.otherUser.gender,
          location: selectedMatch?.otherUser.location,
          lastActiveLabel: selectedMatch
            ? getLastActiveLabel(selectedMatch.otherUser.lastActiveAt)
            : null,
          bio: selectedMatch?.otherUser.bio,
          lookingFor: selectedMatch?.otherUser.lookingFor,
          interests: selectedMatch?.otherUser.interests,
          values: selectedMatch?.otherUser.values,
          partnerQualities: selectedMatch?.otherUser.partnerQualities,
          dealbreakers: selectedMatch?.otherUser.dealbreakers,
          preferredGenders: selectedMatch?.otherUser.preferredGenders,
        }}
        commonInterests={partnerDrawerCommonInterests}
        onPhotoSelect={(photos, photo) => openPhotoLightbox(photos, photo)}
        onReport={() => {
          if (selectedMatch) openReportForMatch(selectedMatch);
        }}
      />
      <div className="matches-sidebar">
        <h2 className="matches-title">Your Matches</h2>

        {matches.length === 0 ? (
          <div className="no-matches">
            <p>No matches yet!</p>
            <p className="hint">Use Connect and your tokens to match with people.</p>
            <Link to="/browse" className="matches-empty-cta">
              ✨ Browse People
            </Link>
          </div>
        ) : (
          <div className="matches-list" role="list">
            {matches.map((match) => (
              <div
                key={match.id}
                role="listitem"
                tabIndex={0}
                className={`match-item ${selectedMatch?.id === match.id ? "active" : ""} ${
                  (match.unreadCount || 0) > 0 ? "match-item--unread" : ""
                }`}
                aria-label={`${match.otherUser.displayName}, ${getStageLabel(match.stage)}${
                  (match.unreadCount || 0) > 0
                    ? `, ${match.unreadCount} unread ${match.unreadCount === 1 ? "message" : "messages"}`
                    : ""
                }. Open chat.`}
                onClick={() => openMatchThread(match)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openMatchThread(match);
                  }
                }}
              >
                <div className="match-item-inner">
                  <div className="match-avatar">
                    {(() => {
                      if (match.stage === "stage1" || match.stage === "stage2") {
                        if (match.otherUser.photoUrl) {
                          return (
                            <img
                              src={getPhotoUrl(match.otherUser.photoUrl)}
                              alt=""
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                              }}
                            />
                          );
                        }
                        if (match.otherUser.photos && match.otherUser.photos.length > 0) {
                          const primaryPhoto = match.otherUser.photos.find((p) => p.isPrimary);
                          return (
                            <img
                              src={getPhotoUrl(primaryPhoto?.url || match.otherUser.photos[0].url)}
                              alt=""
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                              }}
                            />
                          );
                        }
                      }
                      return (
                        <span className="avatar-placeholder">
                          {match.stage === "pending" ? "⏳" : "🔓"}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="match-item-primary">
                    <div className="match-item-title-row">
                      <h4 className="match-item-name">
                        {match.otherUser.displayName}
                        {(match.unreadCount || 0) > 0 ? (
                          <span className="match-unread-dot" aria-hidden />
                        ) : null}
                      </h4>
                      {(match.unreadCount || 0) > 0 ? (
                        <span
                          className="match-unread-badge"
                          aria-label={`${match.unreadCount} unread ${match.unreadCount === 1 ? "message" : "messages"}`}
                        >
                          {match.unreadCount! > 99 ? "99+" : match.unreadCount}
                        </span>
                      ) : null}
                      <span className={`stage-badge stage-badge--sidebar ${getStageColor(match.stage)}`}>
                        {getStageLabel(match.stage)}
                      </span>
                    </div>
                    <p className="match-meta">
                      {match.otherUser.age} · {match.otherUser.gender}
                    </p>
                    {getLastActiveLabel(match.otherUser.lastActiveAt) ? (
                      <p className="match-active-status" aria-label="Last active">
                        🟢 {getLastActiveLabel(match.otherUser.lastActiveAt)}
                      </p>
                    ) : null}
                    {match.stage !== "pending" &&
                      (match.profileCompatibility != null ||
                        match.compatibilityScore != null ||
                        match.expiresAt) && (
                        <div className="match-item-signals" aria-label="Match signals">
                          {(match.profileCompatibility != null || match.compatibilityScore != null) && (
                            <div className="match-compat-badges">
                              {match.profileCompatibility != null ? (
                                <span className="match-compat-badge match-compat-badge--interest" title="Interest match">
                                  🎯 {match.profileCompatibility}%
                                </span>
                              ) : null}
                              {match.compatibilityScore != null ? (
                                <span
                                  className="match-compat-badge match-compat-badge--pulse"
                                  title="Compatibility pulse — updates as you chat"
                                >
                                  💫 {Math.round(match.compatibilityScore)}
                                </span>
                              ) : null}
                            </div>
                          )}
                          {match.expiresAt ? (
                            <div className="match-timer match-timer--card">
                              <span className="timer-icon" aria-hidden>
                                ⏳
                              </span>
                              <span className="timer-text">
                                {(() => {
                                  const daysRemaining = getDaysRemaining(match.expiresAt);
                                  if (daysRemaining === null) return "";
                                  if (daysRemaining === 0) return "Expires today";
                                  if (daysRemaining === 1) return "1 day left";
                                  return `${daysRemaining} days left`;
                                })()}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      )}
                  </div>
                </div>
                {(match.stage !== "pending" || selectedMatch?.id === match.id) && (
                  <div
                    className="match-item-toolbar"
                    role="toolbar"
                    aria-label={`Actions for ${match.otherUser.displayName}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {match.stage !== "pending" && (
                      <button
                        type="button"
                        className="match-card-action-btn match-card-action-btn--muted"
                        onClick={(e) => openReportForMatch(match, e)}
                      >
                        Report
                      </button>
                    )}
                    {selectedMatch?.id === match.id && (
                      <button
                        type="button"
                        className="match-card-action-btn match-card-action-btn--danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnmatchClick();
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedMatch && (!isNarrow || !mobileShowMatchList) ? (
        <div className="matches-main">
          <>
            <div className="matches-chat-chrome">
            {isNarrow && !mobileShowMatchList && (
              <button
                type="button"
                className="matches-mobile-back-btn"
                onClick={() => setMobileShowMatchList(true)}
              >
                ← All matches
              </button>
            )}
            <div className="chat-header">
              <div className="chat-header-primary">
                <div className="chat-user-info">
                  <button
                    type="button"
                    className={`chat-avatar-btn ${
                      selectedMatchPhotos.length > 0 ? "chat-avatar-btn--zoom" : "chat-avatar-btn--profile-only"
                    }`}
                    aria-label={
                      selectedMatchPhotos.length > 0
                        ? `View photos — ${selectedMatch.otherUser.displayName}`
                        : `Open profile — ${selectedMatch.otherUser.displayName}`
                    }
                    onClick={() => {
                      if (!selectedMatch) return;
                      if (selectedMatchPhotos.length > 0) {
                        openPhotoLightbox(selectedMatchPhotos, selectedMatchPhotos[0]);
                      } else {
                        setPartnerDrawerOpen(true);
                      }
                    }}
                  >
                    <span className="chat-avatar">
                      {(selectedMatch.stage === "stage1" || selectedMatch.stage === "stage2") &&
                      selectedMatch.otherUser.photoUrl ? (
                        <img
                          src={getPhotoUrl(selectedMatch.otherUser.photoUrl)}
                          alt=""
                          draggable={false}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                          }}
                        />
                      ) : (selectedMatch.stage === "stage1" || selectedMatch.stage === "stage2") &&
                        selectedMatchPhotos.length > 0 ? (
                        <img
                          src={getPhotoUrl(selectedMatchPhotos[0].url)}
                          alt=""
                          draggable={false}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="avatar-placeholder large">
                          {selectedMatch.stage === "pending" ? "⏳" : "🔓"}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="chat-user-meta-block">
                    <h3>{selectedMatch.otherUser.displayName}</h3>
                    <p>
                      {selectedMatch.otherUser.age} · {selectedMatch.otherUser.gender}
                      {selectedMatch.otherUser.location && ` · ${selectedMatch.otherUser.location}`}
                    </p>
                    {getLastActiveLabel(selectedMatch.otherUser.lastActiveAt) ? (
                      <p className="chat-active-status" aria-label="Last active">
                        🟢 {getLastActiveLabel(selectedMatch.otherUser.lastActiveAt)}
                      </p>
                    ) : null}
                    {selectedMatch.stage !== "pending" && selectedMatch.expiresAt ? (
                      <div className="match-timer-header">
                        <span className="timer-icon">⏳</span>
                        <span className="timer-text">
                          {(() => {
                            const daysRemaining = getDaysRemaining(selectedMatch.expiresAt);
                            if (daysRemaining === null) return "";
                            if (daysRemaining === 0) return "Expires today";
                            if (daysRemaining === 1) return "1 day left";
                            return `${daysRemaining} days left`;
                          })()}
                        </span>
                      </div>
                    ) : null}
                    {selectedMatch.stage !== "pending" ? (
                      <div className="chat-header-toolbar">
                        <div className="chat-header-actions-row">
                          <button
                            type="button"
                            className="chat-partner-sheet-trigger btn btn-secondary btn-sm"
                            onClick={() => setPartnerDrawerOpen(true)}
                          >
                            {mobileChatOpen ? "Profile" : "Profile · photos"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm chat-header-report-btn"
                            onClick={() => openReportForMatch(selectedMatch)}
                          >
                            Report
                          </button>
                        </div>
                        {(liveProfileCompatibility != null ||
                          selectedMatch.profileCompatibility != null ||
                          pulseScore != null ||
                          selectedMatch.compatibilityScore != null) && (
                          <div className="chat-header-compat-row">
                            {(liveProfileCompatibility ?? selectedMatch.profileCompatibility) != null ? (
                              <button
                                type="button"
                                className={`chat-header-interest-badge${
                                  (liveProfileCompatibility ?? selectedMatch.profileCompatibility)! >= 80
                                    ? " chat-header-interest-badge--high"
                                    : ""
                                }`}
                                onClick={() => setShowInterestCompatModal(true)}
                                title="Why you match"
                              >
                                <span aria-hidden>🎯</span>{" "}
                                {liveProfileCompatibility ?? selectedMatch.profileCompatibility}%
                              </button>
                            ) : null}
                            {(pulseScore != null ||
                              (typeof selectedMatch.compatibilityScore === "number" &&
                                !Number.isNaN(selectedMatch.compatibilityScore))) && (
                              <button
                                type="button"
                                className={`compatibility-pulse-pill compatibility-pulse-pill--${
                                  pulseEngagement ?? "neutral"
                                }`}
                                title="Compatibility pulse — tap for details"
                                aria-label="Compatibility pulse, open details"
                                onClick={() => setShowPulseCompatModal(true)}
                              >
                                <span className="compatibility-pulse-pill-dot" aria-hidden />
                                <span className="compatibility-pulse-pill-label">Pulse</span>
                                <span className="compatibility-pulse-pill-value">
                                  {pulseScore ??
                                    Math.round(selectedMatch.compatibilityScore as number)}
                                </span>
                                {pulseEngagement && !mobileChatOpen ? (
                                  <span className="compatibility-pulse-pill-tier">
                                    {" "}
                                    · {PULSE_ENGAGEMENT_LABEL[pulseEngagement]}
                                  </span>
                                ) : null}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {selectedMatch.stage !== "pending" && user && (
                <div className="chat-header-games">
                  <DateBlueprintWeb
                    matchId={selectedMatch.id}
                    socket={socketRef.current}
                    currentUserId={user.id}
                    isCurrentUserMatchUser1={selectedMatch.isInitiator}
                    onInviteToChat={sendChatText}
                    onPlanGenerated={() =>
                      setNotification({
                        message: "🎉 Date Plan Generator unlocked! Your first hangout plan is ready.",
                        type: "success",
                        duration: 5000,
                      })
                    }
                    messages={messages}
                    chatPartnerUserId={selectedMatch.otherUser.userId}
                  />
                  <TruthOrDareWeb
                    matchId={selectedMatch.id}
                    socket={socketRef.current}
                    messages={messages}
                    gameChatMessages={messages}
                    currentUserId={user.id}
                    chatPartnerUserId={selectedMatch.otherUser.userId}
                    partnerDisplayName={selectedMatch.otherUser.displayName}
                    partnerIsTyping={typingUsers.has(selectedMatch.otherUser.userId)}
                    sendingMessage={sendingMessage}
                    onSendToChat={sendChatText}
                    onBeforeUnlockPrompt={async () => {
                      const list = await fetchMatches();
                      const id = selectedMatchIdRef.current;
                      const m = list.find((x) => x.id === id);
                      if (m?.gameUnlocks?.truth_or_dare) {
                        setSelectedMatch(m);
                        return true;
                      }
                      return false;
                    }}
                    onUnlockWithToken={async () => {
                      await api.post(`/matches/${selectedMatch.id}/unlock-game`, {
                        gameType: "truth_or_dare",
                      });
                      setNotification({
                        message: "🎉 Truth or Dare unlocked! Let the spicy fun begin.",
                        type: "success",
                        duration: 4500,
                      });
                      const list = await fetchMatches();
                      const id = selectedMatch.id;
                      const m = list.find((x) => x.id === id);
                      if (m) {
                        setSelectedMatch({
                          ...m,
                          gameUnlocks: {
                            ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
                            truth_or_dare: true,
                          },
                        });
                        setMatches((prev) =>
                          prev.map((x) =>
                            x.id === id
                              ? {
                                  ...x,
                                  gameUnlocks: {
                                    ...(x.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
                                    truth_or_dare: true,
                                  },
                                }
                              : x
                          )
                        );
                      }
                    }}
                    openForAccept={
                      openGameForAccept?.gameType === "truth_or_dare" &&
                      openGameForAccept?.matchId === selectedMatch.id
                    }
                    onOpenedForAccept={() => setOpenGameForAccept(null)}
                    gameUnlockedByToken={!!selectedMatch.gameUnlocks?.truth_or_dare}
                  />
                  <NeverHaveIEverWeb
                    matchId={selectedMatch.id}
                    socket={socketRef.current}
                    onSendToChat={sendChatText}
                    gameChatMessages={messages}
                    messages={messages}
                    chatPartnerUserId={selectedMatch.otherUser.userId}
                    currentUserId={user.id}
                    sendingMessage={sendingMessage}
                    partnerDisplayName={selectedMatch.otherUser.displayName}
                    partnerIsTyping={typingUsers.has(selectedMatch.otherUser.userId)}
                    onBeforeUnlockPrompt={async () => {
                      const list = await fetchMatches();
                      const id = selectedMatchIdRef.current;
                      const m = list.find((x) => x.id === id);
                      if (m?.gameUnlocks?.never_have_i_ever) {
                        setSelectedMatch(m);
                        return true;
                      }
                      return false;
                    }}
                    onUnlockWithToken={async () => {
                      await api.post(`/matches/${selectedMatch.id}/unlock-game`, {
                        gameType: "never_have_i_ever",
                      });
                      setNotification({
                        message: "🎉 Never Have I Ever unlocked! Time to spill secrets.",
                        type: "success",
                        duration: 4500,
                      });
                      const list = await fetchMatches();
                      const id = selectedMatch.id;
                      const m = list.find((x) => x.id === id);
                      if (m) {
                        setSelectedMatch({
                          ...m,
                          gameUnlocks: {
                            ...(m.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
                            never_have_i_ever: true,
                          },
                        });
                        setMatches((prev) =>
                          prev.map((x) =>
                            x.id === id
                              ? {
                                  ...x,
                                  gameUnlocks: {
                                    ...(x.gameUnlocks || { truth_or_dare: false, never_have_i_ever: false }),
                                    never_have_i_ever: true,
                                  },
                                }
                              : x
                          )
                        );
                      }
                    }}
                    openForAccept={
                      openGameForAccept?.gameType === "never_have_i_ever" &&
                      openGameForAccept?.matchId === selectedMatch.id
                    }
                    onOpenedForAccept={() => setOpenGameForAccept(null)}
                    gameUnlockedByToken={!!selectedMatch.gameUnlocks?.never_have_i_ever}
                  />
                </div>
              )}

              <div className="match-actions">
                {isNarrow && selectedMatch.stage !== "pending" && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm chat-header-unmatch-btn"
                    onClick={handleUnmatchClick}
                  >
                    Remove match
                  </button>
                )}
              </div>
            </div>
            </div>

            {selectedMatch.stage === "pending" ? (
              <div className="pending-state">
                <div className="pending-icon-large">⏳</div>
                <h3>Waiting for {selectedMatch.otherUser.displayName}</h3>
                <p>
                  {selectedMatch.isInitiator
                    ? "You sent a connection request. When they accept, you can start chatting."
                    : "They want to connect! Accept to start chatting."}
                </p>
                {selectedMatch.otherUser.bio && (
                  <div className="pending-bio">
                    <h4>About them:</h4>
                    <p>{selectedMatch.otherUser.bio}</p>
                  </div>
                )}
                {selectedMatch.otherUser.interests.length > 0 && (
                  <div className="pending-interests">
                    <h4>Their interests:</h4>
                    <div className="profile-card-interests">
                      {selectedMatch.otherUser.interests.map((interest) => (
                        <span key={interest} className="interest-tag">
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="matches-chat-column">
                <div className="messages-container" ref={messagesContainerRef}>
                  {messages.length === 0 ? (
                    <div className="no-messages">
                      <p>No messages yet. Say hi! 👋</p>
                    </div>
                  ) : (
                    <div className="messages-list">
                      {messages.map((msg) => {
                        const hasMedia = !!(msg.imageUrl || msg.videoUrl || msg.audioUrl);
                        return (
                          <div
                            key={msg.id}
                            className={`message ${msg.isOwn ? "own" : "other"}`}
                          >
                            <div
                              className={`message-content${hasMedia ? " message-content--media" : ""}`}
                            >
                              {msg.imageUrl ? (
                                <a
                                  href={getPhotoUrl(msg.imageUrl) || msg.imageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="message-media-link"
                                >
                                  <img
                                    src={getPhotoUrl(msg.imageUrl) || msg.imageUrl}
                                    alt=""
                                    className="message-image"
                                  />
                                </a>
                              ) : null}
                              {msg.videoUrl ? (
                                <video
                                  className="message-video"
                                  src={getPhotoUrl(msg.videoUrl) || msg.videoUrl}
                                  controls
                                  playsInline
                                  preload="metadata"
                                />
                              ) : null}
                              {msg.audioUrl ? (
                                <audio
                                  className="message-audio"
                                  controls
                                  preload="metadata"
                                  src={getPhotoUrl(msg.audioUrl) || msg.audioUrl || undefined}
                                />
                              ) : null}
                              {msg.content?.trim() ? (
                                <div className="message-text">{msg.content}</div>
                              ) : null}
                              <div
                                className={`message-meta ${msg.isOwn ? "message-meta-own" : "message-meta-other"}`}
                              >
                                <div className="message-time">
                                  {new Date(msg.sentAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                  {msg.isOwn ? (
                                    <span
                                      className={
                                        msg.readAt ? "read-receipt" : "message-sent-receipt"
                                      }
                                    >
                                      {msg.readAt ? "✓ Read" : "✓"}
                                    </span>
                                  ) : null}
                                </div>
                                {!msg.isOwn && user?.id ? (
                                  <div className="message-reaction-btns">
                                    <button
                                      type="button"
                                      className={`message-love-btn${msg.likedBy === user.id ? " message-love-btn--active" : ""}`}
                                      disabled={reactionBusyMessageId === msg.id}
                                      aria-label={
                                        msg.likedBy === user.id
                                          ? "Remove heart"
                                          : "Love this message"
                                      }
                                      title={
                                        msg.likedBy === user.id ? "Tap to remove heart" : "Love"
                                      }
                                      onClick={() =>
                                        void toggleMessageLove(msg.id, msg.likedBy === user.id)
                                      }
                                    >
                                      {msg.likedBy === user.id ? "❤️" : "🤍"}
                                    </button>
                                    <button
                                      type="button"
                                      className={`message-laugh-btn${msg.laughedBy === user.id ? " message-laugh-btn--active" : ""}`}
                                      disabled={reactionBusyMessageId === msg.id}
                                      aria-label={
                                        msg.laughedBy === user.id
                                          ? "Remove laugh"
                                          : "Laugh at this message"
                                      }
                                      title={
                                        msg.laughedBy === user.id ? "Tap to remove laugh" : "Laugh"
                                      }
                                      onClick={() =>
                                        void toggleMessageLaugh(
                                          msg.id,
                                          msg.laughedBy === user.id
                                        )
                                      }
                                    >
                                      {msg.laughedBy === user.id ? "😂" : "😂"}
                                    </button>
                                    <button
                                      type="button"
                                      className={`message-heart-eyes-btn${msg.heartEyesBy === user.id ? " message-heart-eyes-btn--active" : ""}`}
                                      disabled={reactionBusyMessageId === msg.id}
                                      aria-label={
                                        msg.heartEyesBy === user.id
                                          ? "Remove heart eyes"
                                          : "React with heart eyes"
                                      }
                                      title={
                                        msg.heartEyesBy === user.id
                                          ? "Tap to remove heart eyes"
                                          : "Heart eyes"
                                      }
                                      onClick={() =>
                                        void toggleMessageHeartEyes(
                                          msg.id,
                                          msg.heartEyesBy === user.id
                                        )
                                      }
                                    >
                                      {msg.heartEyesBy === user.id ? "😍" : "😍"}
                                    </button>
                                  </div>
                                ) : null}
                                {msg.isOwn && (msg.likedBy || msg.laughedBy || msg.heartEyesBy) ? (
                                  <span className="message-reacted-by-them" title="Their reaction">
                                    {msg.likedBy ? "❤️" : msg.laughedBy ? "😂" : msg.heartEyesBy ? "😍" : null}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div
                  key={`composer-${selectedMatch.id}`}
                  ref={messageComposerRef}
                  className="message-input-container"
                >
                  {selectedMatch.stage === "stage1" ? (
                    <div className="chat-composer-meta">
                      <Stage1PhotoUnlockCompact
                        myCount={chatMediaMessageCounts.my}
                        theirCount={chatMediaMessageCounts.their}
                        onOpenExplainer={() => setPhotoUnlockExplainerOpen(true)}
                      />
                    </div>
                  ) : null}
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="message-file-input-hidden"
                    onChange={onImageFileChange}
                    aria-hidden
                  />
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-m4v,.mp4,.mov"
                    className="message-file-input-hidden"
                    onChange={onVideoFileChange}
                    aria-hidden
                  />
                  {!chatMediaUnlocked && (
                    <p className="chat-media-lock-hint" role="note">
                      <span className="chat-media-lock-hint-icon" aria-hidden>
                        🔒
                      </span>
                      <span className="chat-media-lock-hint-text">
                        <strong>Photos, video &amp; voice</strong> unlock after 3 messages each.{" "}
                        <span className="chat-media-lock-hint-counts">
                          You{" "}
                          <span
                            className={
                              chatMediaMessageCounts.my >= 3
                                ? "chat-media-lock-hint-count chat-media-lock-hint-count--done"
                                : "chat-media-lock-hint-count"
                            }
                          >
                            {Math.min(chatMediaMessageCounts.my, 3)}/3
                          </span>
                          {" · "}
                          Match{" "}
                          <span
                            className={
                              chatMediaMessageCounts.their >= 3
                                ? "chat-media-lock-hint-count chat-media-lock-hint-count--done"
                                : "chat-media-lock-hint-count"
                            }
                          >
                            {Math.min(chatMediaMessageCounts.their, 3)}/3
                          </span>
                        </span>
                      </span>
                    </p>
                  )}
                  {pendingImagePreviewUrl ? (
                    <div className="chat-pending-media">
                      <img src={pendingImagePreviewUrl} alt="" className="chat-pending-thumb" />
                      <button type="button" className="chat-pending-remove" onClick={clearPendingImage}>
                        Remove photo
                      </button>
                    </div>
                  ) : null}
                  {pendingVideoFile ? (
                    <div className="chat-pending-media">
                      <span className="chat-pending-video-label">
                        Video: {pendingVideoFile.name}
                      </span>
                      <button type="button" className="chat-pending-remove" onClick={clearPendingVideo}>
                        Remove video
                      </button>
                    </div>
                  ) : null}
                  {isRecordingVoice ? (
                    <div className="chat-voice-recording-bar">
                      <span className="chat-voice-dot" aria-hidden />
                      <span>Recording…</span>
                      <button type="button" className="btn btn-ghost chat-voice-btn" onClick={cancelVoiceRecording}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary chat-voice-btn" onClick={finishVoiceRecording}>
                        Send recording
                      </button>
                    </div>
                  ) : null}
                  {(uploadingImage || uploadingVideo || uploadingAudio) && (
                    <div className="chat-uploading-bar" role="status">
                      {uploadingImage && "Sending photo…"}
                      {uploadingVideo && "Sending video…"}
                      {uploadingAudio && "Sending voice…"}
                    </div>
                  )}
                  {typingUsers.size > 0 && (
                    <div className="typing-indicator">
                      {selectedMatch.otherUser.displayName} is typing...
                    </div>
                  )}
                  <div className="message-input-wrapper">
                    <div className="message-input-attachments" title="Add photo, video, or voice (unlocks after 3 messages each)">
                      <button
                        type="button"
                        className="message-attach-btn"
                        onClick={openImagePicker}
                        disabled={
                          sendingMessage ||
                          uploadingImage ||
                          uploadingVideo ||
                          uploadingAudio ||
                          isRecordingVoice
                        }
                        aria-label="Attach photo"
                      >
                        📷
                      </button>
                      <button
                        type="button"
                        className="message-attach-btn"
                        onClick={openVideoPicker}
                        disabled={
                          sendingMessage ||
                          uploadingImage ||
                          uploadingVideo ||
                          uploadingAudio ||
                          isRecordingVoice
                        }
                        aria-label="Attach video"
                      >
                        🎥
                      </button>
                      <button
                        type="button"
                        className="message-attach-btn"
                        onClick={() => void startVoiceRecording()}
                        disabled={
                          sendingMessage ||
                          uploadingImage ||
                          uploadingVideo ||
                          uploadingAudio ||
                          isRecordingVoice
                        }
                        aria-label="Record voice message"
                      >
                        🎤
                      </button>
                    </div>
                    <textarea
                      key={`chat-message-${selectedMatch.id}`}
                      ref={messageInputRef}
                      className="message-input"
                      value={newMessage}
                      rows={2}
                      autoComplete="off"
                      autoCorrect="on"
                      autoCapitalize="sentences"
                      spellCheck
                      data-lpignore="true"
                      data-form-type="other"
                      name={`mulligan-chat-${selectedMatch.id}`}
                      onFocus={() => {
                        if (typeof window !== "undefined" && window.innerWidth <= 900) {
                          syncMobileChatKeyboardInset();
                        }
                      }}
                      onBlur={() => {
                        if (typeof window !== "undefined" && window.innerWidth <= 900) {
                          setTimeout(() => ensureMobileComposerVisible(), 50);
                          setTimeout(() => ensureMobileComposerVisible(), 200);
                        }
                      }}
                      onChange={(e) => {
                        const value = e.target.value;
                        composerTextRef.current = value;
                        if (selectedMatch?.id) {
                          messageDraftsRef.current[selectedMatch.id] = value;
                        }
                        setNewMessage(value);
                        handleTyping();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                      disabled={uploadingImage || uploadingVideo || uploadingAudio}
                    />
                    <button
                      type="button"
                      className="btn btn-primary send-btn"
                      onClick={() => void handleSendMessage()}
                      disabled={
                        sendingMessage ||
                        uploadingImage ||
                        uploadingVideo ||
                        uploadingAudio ||
                        (!newMessage.trim() && !pendingImageFile && !pendingVideoFile)
                      }
                    >
                      {sendingMessage || uploadingImage || uploadingVideo || uploadingAudio ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        </div>
      ) : null}
    </div>
  );
}

