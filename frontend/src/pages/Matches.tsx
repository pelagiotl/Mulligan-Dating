import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { api, ApiError } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { getPhotoUrl } from "../utils/photoUrl";
import { formatPreferredMatchesFromGenders } from "../utils/preferredMatchesLabel";
import Notification from "../components/Notification";
import ConfirmModal from "../components/ConfirmModal";
import TruthOrDareWeb from "../components/TruthOrDareWeb";
import GameRequestModalWeb, { type PendingGameRequestWeb } from "../components/GameRequestModalWeb";

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
  gameUnlocks?: { truth_or_dare: boolean; never_have_i_ever: boolean };
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

function matchHasProfileDetails(ou: Match["otherUser"]): boolean {
  return !!(
    ou.bio ||
    ou.lookingFor ||
    (ou.partnerQualities?.length ?? 0) > 0 ||
    (ou.interests?.length ?? 0) > 0 ||
    (ou.values?.length ?? 0) > 0 ||
    (ou.dealbreakers?.length ?? 0) > 0 ||
    ou.preferredGenders !== undefined
  );
}

/** Shared profile blocks for stage1 (horizontal) and stage2 (stacked). */
function MatchOtherProfileSections({
  otherUser,
  variant,
}: {
  otherUser: Match["otherUser"];
  variant: "stage1" | "stage2";
}) {
  const hasAny =
    !!otherUser.bio ||
    !!otherUser.lookingFor ||
    (otherUser.partnerQualities?.length ?? 0) > 0 ||
    (otherUser.interests?.length ?? 0) > 0 ||
    (otherUser.values?.length ?? 0) > 0 ||
    (otherUser.dealbreakers?.length ?? 0) > 0 ||
    otherUser.preferredGenders !== undefined;
  if (!hasAny) return null;

  const blocks = (
    <>
      {otherUser.lookingFor ? (
        <div className={variant === "stage1" ? "stage1-section" : "stage2-profile-block"}>
          <h4>Looking for</h4>
          <p className="stage2-profile-text">{otherUser.lookingFor}</p>
        </div>
      ) : null}
      {otherUser.preferredGenders !== undefined ? (
        <div className={variant === "stage1" ? "stage1-section" : "stage2-profile-block"}>
          <h4>Wants to connect with</h4>
          <p className="stage2-profile-text">{formatPreferredMatchesFromGenders(otherUser.preferredGenders)}</p>
        </div>
      ) : null}
      {otherUser.bio ? (
        <div className={variant === "stage1" ? "stage1-section" : "stage2-profile-block"}>
          <h4>About</h4>
          <p className="stage1-bio stage2-profile-text">{otherUser.bio}</p>
        </div>
      ) : null}
      {(otherUser.partnerQualities?.length ?? 0) > 0 ? (
        <div className={variant === "stage1" ? "stage1-section" : "stage2-profile-block"}>
          <h4>What they&apos;re looking for</h4>
          <div className="qualities-list">
            {otherUser.partnerQualities.map((q, idx) => (
              <div key={idx} className="quality-item">
                <span className="quality-name">{q.quality}</span>
                <span className="quality-importance">{"⭐".repeat(q.importance)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {(otherUser.interests?.length ?? 0) > 0 ? (
        <div className={variant === "stage1" ? "stage1-section" : "stage2-profile-block"}>
          <h4>Interests</h4>
          <div className="profile-card-interests">
            {otherUser.interests.map((interest) => (
              <span key={interest} className="interest-tag">
                {interest}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {(otherUser.values?.length ?? 0) > 0 ? (
        <div className={variant === "stage1" ? "stage1-section" : "stage2-profile-block"}>
          <h4>Values</h4>
          <div className="profile-card-interests">
            {otherUser.values.map((value) => (
              <span key={value} className="value-tag">
                {value}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {(otherUser.dealbreakers?.length ?? 0) > 0 ? (
        <div className={variant === "stage1" ? "stage1-section" : "stage2-profile-block"}>
          <h4>Dealbreakers</h4>
          <ul className="stage2-dealbreakers-list">
            {otherUser.dealbreakers!.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  if (variant === "stage1") {
    return (
      <div className="stage1-profile-info">
        <div className="stage1-sections-grid">{blocks}</div>
      </div>
    );
  }
  return <div className="stage2-profile-sections-inner">{blocks}</div>;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  readAt?: string | null;
  isOwn: boolean;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
}

const CHAT_MEDIA_LOCKED_HINT =
  "Photos, video, and voice unlock after you and your match have each sent at least 3 messages in this chat.";

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
  const [messageCounts, setMessageCounts] = useState<{ user: number; other: number } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" | "warning" | "error" } | null>(null);
  const [showUnmatchConfirm, setShowUnmatchConfirm] = useState(false);
  const [photoLightbox, setPhotoLightbox] = useState<PhotoLightboxState | null>(null);
  /** Full partner profile & photo gallery beside the messaging column */
  const [partnerDrawerOpen, setPartnerDrawerOpen] = useState(false);
  const [mobileShowMatchList, setMobileShowMatchList] = useState(true);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 900
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const selectedMatchIdRef = useRef<string | null>(null);
  const matchesRef = useRef<Match[]>([]);
  const lightboxTouchX = useRef<number | null>(null);
  const [gameRequestToShow, setGameRequestToShow] = useState<PendingGameRequestWeb | null>(null);
  const [openGameForAccept, setOpenGameForAccept] = useState<{
    matchId: string;
    gameType: "truth_or_dare" | "never_have_i_ever";
  } | null>(null);

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

  const selectedMatchPhotos = useMemo((): Photo[] => {
    if (!selectedMatch || selectedMatch.stage === "pending") return [];
    return getOtherUserPhotosForLightbox(selectedMatch);
  }, [selectedMatch]);

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
      if (!prev) return null;
      const next = prev.index + delta;
      if (next < 0 || next >= prev.urls.length) return prev;
      return { ...prev, index: next };
    });
  }, []);

  const openPhotoLightbox = useCallback((photos: Photo[], startPhoto: Photo) => {
    const sorted = [...photos].sort((a, b) => a.displayOrder - b.displayOrder);
    const urls = sorted.map((p) => getPhotoUrl(p.url));
    const idx = sorted.findIndex((p) => p.id === startPhoto.id);
    setPhotoLightbox({ urls, index: idx >= 0 ? idx : 0 });
  }, []);

  useEffect(() => {
    selectedMatchIdRef.current = selectedMatch?.id ?? null;
  }, [selectedMatch?.id]);

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
    const socketUrl: string = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_NGROK_URL || 'http://localhost:3001';
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
      if (message.matchId && openId && message.matchId !== openId) {
        return;
      }
      setMessages((prev) => {
        // Check if message already exists (avoid duplicates)
        if (prev.some((m) => m.id === message.id)) {
          return prev;
        }
        const updated = [...prev, { ...message, isOwn: message.senderId === user.id }];
        
        // Update message counts (only count alternating messages)
        if (selectedMatch && user) {
          // Sort messages by sentAt to process in chronological order
          const sortedMessages = [...updated].sort((a, b) => 
            new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
          );
          
          let userValidCount = 0;
          let otherValidCount = 0;
          
          for (let i = 0; i < sortedMessages.length; i++) {
            const currentMessage = sortedMessages[i];
            const isUser = currentMessage.senderId === user.id;
            
            if (i === 0) {
              // First message always counts (it starts the conversation)
              if (isUser) userValidCount++;
              else otherValidCount++;
            } else {
              // Subsequent messages only count if the previous message was from the other user
              const previousMessage = sortedMessages[i - 1];
              const previousWasUser = previousMessage.senderId === user.id;
              
              if (isUser && !previousWasUser) {
                // User replied to other user
                userValidCount++;
              } else if (!isUser && previousWasUser) {
                // Other user replied to user
                otherValidCount++;
              }
              // If same user sent consecutive messages, don't count the second one
            }
          }
          
          setMessageCounts({ user: userValidCount, other: otherValidCount });
        }
        
        return updated;
      });
    });

    // Handle stage advancement
    socket.on('stage_advanced', (data: { matchId: string; stage: string; message: string; autoAdvanced?: boolean }) => {
      setMatches((prev) =>
        prev.map((m) =>
          m.id === data.matchId ? { ...m, stage: data.stage as "stage1" | "stage2" } : m
        )
      );
      if (selectedMatch?.id === data.matchId) {
        setSelectedMatch((prev) => (prev ? { ...prev, stage: data.stage as "stage1" | "stage2" } : null));
        // Fetch photos when stage advances
        fetchMatchPhotos(selectedMatch);
        
        // Show cool notification if auto-advanced
        if (data.autoAdvanced) {
          setNotification({
            message: "🎉 All photos unlocked! You've each sent 3+ messages.",
            type: "success"
          });
        }
      } else {
        // Match advanced but not currently selected - still show notification
        if (data.autoAdvanced) {
          setNotification({
            message: "🎉 Photos unlocked in one of your chats! Check it out!",
            type: "success"
          });
        }
      }
    });

    // Handle typing indicators
    socket.on('user_typing', (data: { userId: string; matchId: string; displayName?: string }) => {
      if (selectedMatch?.id === data.matchId && data.userId !== user.id) {
        setTypingUsers((prev) => new Set(prev).add(data.userId));
      }
    });

    socket.on('typing_stopped', (data: { userId: string; matchId: string }) => {
      if (selectedMatch?.id === data.matchId) {
        setTypingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.userId);
          return newSet;
        });
      }
    });

    // Handle read receipts
    socket.on('messages_read', (data: { matchId: string }) => {
      if (selectedMatch?.id === data.matchId) {
        // Update read status for messages sent by current user
        setMessages((prev) =>
          prev.map((msg) =>
            msg.isOwn && !msg.readAt ? { ...msg, readAt: new Date().toISOString() } : msg
          )
        );
      }
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
        if (m) setSelectedMatch(m);
      }
    );

    socket.on(
      "game_request_responded",
      (data: { requestId: string; matchId: string; gameType: string; accepted: boolean }) => {
        if (!data.accepted) return;
        const m = matchesRef.current.find((x) => x.id === data.matchId);
        if (m) {
          setSelectedMatch(m);
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

    return () => {
      socket.disconnect();
    };
  }, [user]);

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
    if (m) setSelectedMatch(m);
    navigate(location.pathname, { replace: true, state: {} });
  }, [loading, matches, location.state, location.pathname, navigate]);

  // Join/leave match room when selected match changes
  useEffect(() => {
    if (!socketRef.current || !selectedMatch) return;

    if (selectedMatch.stage !== "pending") {
      // Join match room
      socketRef.current.emit('join_match', selectedMatch.id);
      
      // Reset message counts
      setMessageCounts(null);
      
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
      if (selectedMatch?.id === match.id) {
        setSelectedMatch(prev => prev ? { ...prev, otherUser: { ...prev.otherUser, photos: photosData.photos } } : null);
      }
    } catch {
      // Photos might not exist
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const fetchMessages = async (matchId: string) => {
    try {
      const data = await api.get<{ messages: Message[] }>(
        `/matches/${matchId}/messages`
      );
      setMessages(data.messages);
      
      // Calculate valid message counts (only count messages that follow a reply from the other user)
      if (selectedMatch && user) {
        // Sort messages by sentAt to process in chronological order
        const sortedMessages = [...data.messages].sort((a, b) => 
          new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
        );
        
        let userValidCount = 0;
        let otherValidCount = 0;
        
        for (let i = 0; i < sortedMessages.length; i++) {
          const currentMessage = sortedMessages[i];
          const isUser = currentMessage.senderId === user.id;
          
          if (i === 0) {
            // First message always counts (it starts the conversation)
            if (isUser) userValidCount++;
            else otherValidCount++;
          } else {
            // Subsequent messages only count if the previous message was from the other user
            const previousMessage = sortedMessages[i - 1];
            const previousWasUser = previousMessage.senderId === user.id;
            
            if (isUser && !previousWasUser) {
              // User replied to other user
              userValidCount++;
            } else if (!isUser && previousWasUser) {
              // Other user replied to user
              otherValidCount++;
            }
            // If same user sent consecutive messages, don't count the second one
          }
        }
        
        setMessageCounts({ user: userValidCount, other: otherValidCount });
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
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
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, stage: "stage2" as const } : m))
      );
      setSelectedMatch((prev) =>
        prev && prev.id === matchId ? { ...prev, stage: "stage2" as const } : prev
      );
      setNotification({
        message: "🎉 All photos unlocked! You've each sent 3+ messages.",
        type: "success",
      });
      const matchForPhotos = { ...snap, id: matchId, stage: "stage2" as const };
      fetchMatchPhotos(matchForPhotos);
    }
  };

  const requireChatMediaUnlocked = () => {
    if (chatMediaUnlocked) return true;
    setNotification({ message: CHAT_MEDIA_LOCKED_HINT, type: "info" });
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

  const startVoiceRecording = async () => {
    if (!selectedMatch || !user) return;
    if (!requireChatMediaUnlocked()) return;
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
      if (!requireChatMediaUnlocked()) return;
      await uploadChatImageAndSend(pendingImageFile);
      return;
    }
    if (pendingVideoFile) {
      if (!requireChatMediaUnlocked()) return;
      await uploadChatVideoAndSend(pendingVideoFile);
      return;
    }
    if (!newMessage.trim()) return;

    const messageContent = newMessage.trim();
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

  /** Send a fixed string (e.g. Truth or Dare prompt) without using the message input field. */
  const sendChatText = async (messageContent: string) => {
    const trimmed = messageContent.trim();
    if (!trimmed || !selectedMatch || sendingMessage) return;
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
    } catch (error) {
      console.error("Failed to send message:", error);
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

  useEffect(() => {
    clearPendingImage();
    clearPendingVideo();
    cancelVoiceRecording();
  }, [selectedMatch?.id, clearPendingImage, clearPendingVideo, cancelVoiceRecording]);

  const openImagePicker = () => {
    if (!requireChatMediaUnlocked()) return;
    imageFileInputRef.current?.click();
  };

  const openVideoPicker = () => {
    if (!requireChatMediaUnlocked()) return;
    videoFileInputRef.current?.click();
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getActivityStatus = (lastActiveAt: string): string => {
    const lastActive = new Date(lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 5) return "🟢 Active now";
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    if (diffDays < 7) return `Active ${diffDays}d ago`;
    return "Last seen a while ago";
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
        isNarrow && selectedMatch && !mobileShowMatchList ? " matches-page--mobile-conversation" : ""
      }`}
    >
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
          duration={6000}
        />
      )}
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
            setSelectedMatch(updated);
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

      {photoLightbox && photoLightbox.urls.length > 0 && (
        <div
          className="match-photo-lightbox"
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
          </div>
        </div>
      )}
      {partnerDrawerOpen && selectedMatch && selectedMatch.stage !== "pending" && (
        <div className="chat-partner-drawer-root">
          <button
            type="button"
            className="chat-partner-drawer-backdrop"
            aria-label="Close profile panel"
            onClick={() => setPartnerDrawerOpen(false)}
          />
          <aside
            className="chat-partner-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-partner-drawer-title"
          >
            <div className="chat-partner-drawer-toolbar">
              <div>
                <h2 id="chat-partner-drawer-title">{selectedMatch.otherUser.displayName}</h2>
                <p className="chat-partner-drawer-sub">
                  {[selectedMatch.otherUser.age, selectedMatch.otherUser.gender].filter(Boolean).join(" · ")}
                  {selectedMatch.otherUser.location ? (
                    <>
                      {" · "}
                      <span aria-hidden>
                        📍{" "}
                      </span>
                      {selectedMatch.otherUser.location}
                    </>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                className="chat-partner-drawer-close"
                onClick={() => setPartnerDrawerOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="chat-partner-drawer-inner">
              {selectedMatchPhotos.length > 0 ? (
                <div className="chat-partner-drawer-gallery-block">
                  <h3 className="chat-partner-drawer-section-label">Photos</h3>
                  <div className="chat-partner-drawer-photo-rail" role="list">
                    {selectedMatchPhotos.map((ph, i) => (
                      <button
                        key={ph.id}
                        type="button"
                        className="chat-partner-drawer-photo-thumb"
                        onClick={() => openPhotoLightbox(selectedMatchPhotos, ph)}
                        role="listitem"
                      >
                        <img
                          src={getPhotoUrl(ph.url)}
                          alt={`${selectedMatch.otherUser.displayName} — photo ${i + 1}`}
                          draggable={false}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </button>
                    ))}
                  </div>
                  <p className="chat-partner-drawer-hint">Tap a photo for full screen</p>
                </div>
              ) : (
                <p className="chat-partner-drawer-empty subtle">
                  {selectedMatch.stage === "stage2"
                    ? "No gallery photos listed yet."
                    : "Additional photos unlock as you chat (both send enough messages first)."}
                </p>
              )}

              <h3 className="chat-partner-drawer-section-label">Profile</h3>
              <div className="chat-partner-drawer-profile">
                {matchHasProfileDetails(selectedMatch.otherUser) ? (
                  <MatchOtherProfileSections otherUser={selectedMatch.otherUser} variant="stage2" />
                ) : (
                  <p className="chat-partner-drawer-empty">They haven&apos;t added written profile sections yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
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
          <div className="matches-list">
            {matches.map((match) => (
              <div
                key={match.id}
                className={`match-item ${selectedMatch?.id === match.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedMatch(match);
                  if (typeof window !== "undefined" && window.innerWidth <= 900) {
                    setMobileShowMatchList(false);
                  }
                }}
              >
                <div className="match-avatar">
                  {(() => {
                    // Show photo if available (for stage1 and stage2)
                    if (match.stage === "stage1" || match.stage === "stage2") {
                      // First try photoUrl (primary photo from backend)
                      if (match.otherUser.photoUrl) {
                        return (
                          <img
                            src={getPhotoUrl(match.otherUser.photoUrl)}
                            alt={match.otherUser.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        );
                      }
                      // Fallback to photos array if available
                      if (match.otherUser.photos && match.otherUser.photos.length > 0) {
                        const primaryPhoto = match.otherUser.photos.find(p => p.isPrimary);
                        return (
                          <img
                            src={getPhotoUrl(primaryPhoto?.url || match.otherUser.photos[0].url)}
                            alt={match.otherUser.displayName}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        );
                      }
                    }
                    // Show placeholder for pending or if no photos available
                    return (
                      <span className="avatar-placeholder">
                        {match.stage === "pending" ? "⏳" : "🔓"}
                      </span>
                    );
                  })()}
                </div>
                <div className="match-info">
                  <h4>{match.otherUser.displayName}</h4>
                  <p className="match-meta">
                    {match.otherUser.age} · {match.otherUser.gender}
                  </p>
                  {match.stage !== "pending" && match.expiresAt && (
                    <div className="match-timer">
                      <span className="timer-icon">⏳</span>
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
                  )}
                </div>
                <div className="match-badge-actions">
                  <span className={`stage-badge ${getStageColor(match.stage)}`}>
                    {getStageLabel(match.stage)}
                  </span>
                  {selectedMatch?.id === match.id && (
                    <button
                      className="btn btn-secondary btn-sm unmatch-btn-sidebar"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnmatchClick();
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="matches-main">
        {selectedMatch ? (
          <>
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
                      <button
                        type="button"
                        className="chat-partner-sheet-trigger btn btn-secondary btn-sm"
                        onClick={() => setPartnerDrawerOpen(true)}
                      >
                        Profile · photos
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {selectedMatch.stage !== "pending" && user && (
                <div className="chat-header-games">
                  <TruthOrDareWeb
                    matchId={selectedMatch.id}
                    socket={socketRef.current}
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
                {selectedMatch.stage === "stage1" && (
                  <div className="reveal-unlock-card">
                    <div className="reveal-unlock-header">
                      <span className="reveal-unlock-icon">🔓</span>
                      <h4 className="reveal-unlock-title">Unlock Additional Photos</h4>
                    </div>
                    <p className="reveal-unlock-description">
                      Keep the conversation going! When you&apos;ve each sent 3 messages, all photos unlock automatically.
                    </p>
                    {messageCounts && (
                      <div className="reveal-progress-container">
                        <div className="reveal-progress-bar-wrapper">
                          <div className="reveal-progress-item">
                            <div className="reveal-progress-label">
                              <span className="reveal-progress-icon">💬</span>
                              <span>Your messages</span>
                            </div>
                            <div className="reveal-progress-bar">
                              <div 
                                className={`reveal-progress-fill ${messageCounts.user >= 3 ? 'complete' : ''}`}
                                style={{ width: `${Math.min((messageCounts.user / 3) * 100, 100)}%` }}
                              />
                              <span className="reveal-progress-text">{messageCounts.user}/3</span>
                            </div>
                          </div>
                          <div className="reveal-progress-item">
                            <div className="reveal-progress-label">
                              <span className="reveal-progress-icon">💬</span>
                              <span>Their messages</span>
                            </div>
                            <div className="reveal-progress-bar">
                              <div 
                                className={`reveal-progress-fill ${messageCounts.other >= 3 ? 'complete' : ''}`}
                                style={{ width: `${Math.min((messageCounts.other / 3) * 100, 100)}%` }}
                              />
                              <span className="reveal-progress-text">{messageCounts.other}/3</span>
                            </div>
                          </div>
                        </div>
                        {messageCounts.user >= 3 && messageCounts.other >= 3 && (
                          <div className="reveal-progress-complete">
                            <span className="reveal-complete-icon">✨</span>
                            <span>Almost there! Keep chatting to unlock photos...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
              <>
                <div className="messages-container">
                  {messages.length === 0 ? (
                    <div className="no-messages">
                      <p>No messages yet. Say hi! 👋</p>
                    </div>
                  ) : (
                    <div className="messages-list">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`message ${msg.isOwn ? "own" : "other"}`}
                        >
                          <div className="message-content">
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
                          </div>
                          <div className="message-time">
                            {new Date(msg.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {msg.isOwn && msg.readAt && (
                              <span className="read-receipt">✓ Read</span>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                <div className="message-input-container">
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
                    <p className="chat-media-lock-hint">{CHAT_MEDIA_LOCKED_HINT}</p>
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
                    <input
                      type="text"
                      className="message-input"
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
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
              </>
            )}
          </>
        ) : (
          <div className="no-match-selected">
            <div className="no-match-icon">💌</div>
            <h3>Select a match</h3>
            <p>Your conversations will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}

