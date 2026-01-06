import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import Notification from "../components/Notification";
import ConfirmModal from "../components/ConfirmModal";

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
  };
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  readAt?: string | null;
  isOwn: boolean;
}

export default function Matches() {
  const { user } = useAuth();
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user) return;

    // Use API URL from environment variable (for production) or ngrok (for testing), otherwise localhost
    const socketUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_NGROK_URL || 'http://localhost:3001';
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
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
    socket.on('new_message', (message: Message) => {
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
            message: "🎉 All photos unlocked! You've both sent 2+ messages!",
            type: "success"
          });
        }
      } else {
        // Match advanced but not currently selected - still show notification
        if (data.autoAdvanced) {
          setNotification({
            message: "🎉 Photos unlocked in one of your matches! Check it out!",
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

    return () => {
      socket.disconnect();
    };
  }, [user]);

  // Fetch matches on component mount
  useEffect(() => {
    fetchMatches();
  }, []);

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
      
      // Fetch photos if in stage2
      if (selectedMatch.stage === "stage2" && !selectedMatch.otherUser.photos) {
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

  const fetchMatches = async () => {
    try {
      const data = await api.get<{ matches: Match[] }>("/matches");
      // Fetch photos for each match in stage2
      const matchesWithPhotos = await Promise.all(
        data.matches.map(async (match) => {
          if (match.stage === "stage2") {
            try {
              // Get profile ID from other user
              const profileData = await api.get<{ profile: { id: string } }>(`/users/${match.otherUser.userId}`);
              const photosData = await api.get<{ photos: Photo[] }>(`/photos/profile/${profileData.profile.id}`);
              match.otherUser.photos = photosData.photos;
            } catch {
              // Photos might not exist
              match.otherUser.photos = [];
            }
          }
          return match;
        })
      );
      setMatches(matchesWithPhotos);
    } catch (error) {
      console.error("Failed to fetch matches:", error);
      // Set empty matches array on error
      setMatches([]);
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
    } catch {
      // Ignore
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedMatch || sendingMessage) return;
    
    if (!socketRef.current || !socketRef.current.connected) {
      setNotification({
        message: "Not connected to server. Please refresh the page.",
        type: "error"
      });
      return;
    }

    const messageContent = newMessage.trim();
    setNewMessage("");
    setIsTyping(false);
    setSendingMessage(true);
    
    // Clear typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing indicator
    socketRef.current.emit('stop_typing', { matchId: selectedMatch.id });
    
    // Send message via WebSocket
    try {
      socketRef.current.emit('send_message', {
        matchId: selectedMatch.id,
        content: messageContent,
      });
      console.log('Message sent:', messageContent);
    } catch (error) {
      console.error('Error sending message:', error);
      setNotification({
        message: "Failed to send message. Please try again.",
        type: "error"
      });
      setSendingMessage(false);
    }

    // Reset sending state after a delay (message will appear via new_message event)
    setTimeout(() => {
      setSendingMessage(false);
    }, 1000);
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

  const _handleRevealPhotos = async () => {
    if (!selectedMatch) return;

    // Confirm with user
    if (!confirm("Are you sure you want to reveal all photos now? This will bypass the automatic reveal (which happens after 2 messages each).")) {
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
        message: `You've unmatched with ${matchName}`,
        type: "info"
      });
    } catch (error) {
      setNotification({
        message: "Failed to unmatch. Please try again.",
        type: "error"
      });
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "pending":
        return "Waiting...";
      case "stage1":
        return "Connected!";
      case "stage2":
        return "Revealed!";
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
    return <div className="loading-screen">Loading your matches...</div>;
  }

  return (
    <div className="matches-page">
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
      <div className="matches-sidebar">
        <h2 className="matches-title">Your Matches</h2>

        {matches.length === 0 ? (
          <div className="no-matches">
            <p>No matches yet!</p>
            <p className="hint">Browse profiles and use tokens to connect.</p>
          </div>
        ) : (
          <div className="matches-list">
            {matches.map((match) => (
              <div
                key={match.id}
                className={`match-item ${selectedMatch?.id === match.id ? "active" : ""}`}
                onClick={() => setSelectedMatch(match)}
              >
                <div className="match-avatar">
                  {(() => {
                    // Show photo if available (for stage1 and stage2)
                    if (match.stage === "stage1" || match.stage === "stage2") {
                      // First try photoUrl (primary photo from backend)
                      if (match.otherUser.photoUrl) {
                        return (
                          <img
                            src={match.otherUser.photoUrl}
                            alt={match.otherUser.displayName}
                          />
                        );
                      }
                      // Fallback to photos array if available
                      if (match.otherUser.photos && match.otherUser.photos.length > 0) {
                        const primaryPhoto = match.otherUser.photos.find(p => p.isPrimary);
                        return (
                          <img
                            src={primaryPhoto?.url || match.otherUser.photos[0].url}
                            alt={match.otherUser.displayName}
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
                      Unmatch
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
            <div className="chat-header">
              <div className="chat-user-info">
                <div className="chat-avatar">
                  {(selectedMatch.stage === "stage1" || selectedMatch.stage === "stage2") &&
                  selectedMatch.otherUser.photoUrl ? (
                    <img
                      src={selectedMatch.otherUser.photoUrl}
                      alt={selectedMatch.otherUser.displayName}
                    />
                  ) : (
                    <span className="avatar-placeholder large">
                      {selectedMatch.stage === "pending" ? "⏳" : "🔓"}
                    </span>
                  )}
                </div>
                <div>
                  <h3>{selectedMatch.otherUser.displayName}</h3>
                  <p>
                    {selectedMatch.otherUser.age} ·{" "}
                    {selectedMatch.otherUser.gender}
                    {selectedMatch.otherUser.location &&
                      ` · ${selectedMatch.otherUser.location}`}
                  </p>
                  {selectedMatch.stage !== "pending" && selectedMatch.expiresAt && (
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
                  )}
                </div>
              </div>

              <div className="match-actions">
                {selectedMatch.stage === "stage1" && (
                  <div className="reveal-unlock-card">
                    <div className="reveal-unlock-header">
                      <span className="reveal-unlock-icon">🔓</span>
                      <h4 className="reveal-unlock-title">Unlock Additional Photos</h4>
                    </div>
                    <p className="reveal-unlock-description">
                      Keep the conversation going! Send at least 2 messages each to automatically reveal all photos.
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
                                className={`reveal-progress-fill ${messageCounts.user >= 2 ? 'complete' : ''}`}
                                style={{ width: `${Math.min((messageCounts.user / 2) * 100, 100)}%` }}
                              />
                              <span className="reveal-progress-text">{messageCounts.user}/2</span>
                            </div>
                          </div>
                          <div className="reveal-progress-item">
                            <div className="reveal-progress-label">
                              <span className="reveal-progress-icon">💬</span>
                              <span>Their messages</span>
                            </div>
                            <div className="reveal-progress-bar">
                              <div 
                                className={`reveal-progress-fill ${messageCounts.other >= 2 ? 'complete' : ''}`}
                                style={{ width: `${Math.min((messageCounts.other / 2) * 100, 100)}%` }}
                              />
                              <span className="reveal-progress-text">{messageCounts.other}/2</span>
                            </div>
                          </div>
                        </div>
                        {messageCounts.user >= 2 && messageCounts.other >= 2 && (
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
                    ? "You've sent a connection request. When they match back, you can start chatting!"
                    : "They want to connect with you! Match back to start chatting."}
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
                {selectedMatch.stage === "stage1" && (
                  <div className="stage1-profile-info">
                    <div className="stage1-sections-grid">
                      {selectedMatch.otherUser.bio && (
                        <div className="stage1-section">
                          <h4>About {selectedMatch.otherUser.displayName}</h4>
                          <p className="stage1-bio">
                            {selectedMatch.otherUser.bio}
                          </p>
                        </div>
                      )}

                      {selectedMatch.otherUser.partnerQualities.length > 0 && (
                        <div className="stage1-section">
                          <h4>What They're Looking For</h4>
                          <div className="qualities-list">
                            {selectedMatch.otherUser.partnerQualities.map(
                              (q, idx) => (
                                <div key={idx} className="quality-item">
                                  <span className="quality-name">{q.quality}</span>
                                  <span className="quality-importance">
                                    {"⭐".repeat(q.importance)}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {selectedMatch.otherUser.interests.length > 0 && (
                        <div className="stage1-section">
                          <h4>Shared Interests</h4>
                          <div className="profile-card-interests">
                            {selectedMatch.otherUser.interests.map((interest) => (
                              <span key={interest} className="interest-tag">
                                {interest}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedMatch.otherUser.values.length > 0 && (
                        <div className="stage1-section">
                          <h4>Their Values</h4>
                          <div className="profile-card-interests">
                            {selectedMatch.otherUser.values.map((value) => (
                              <span key={value} className="value-tag">
                                {value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedMatch.stage === "stage2" && selectedMatch.otherUser.photos && selectedMatch.otherUser.photos.length > 0 && (
                  <div className="stage2-photos-section">
                    <h4>📸 {selectedMatch.otherUser.displayName}'s Photos</h4>
                    <div className="match-photos-grid">
                      {selectedMatch.otherUser.photos.map((photo) => (
                        <div key={photo.id} className="match-photo-item">
                          <img src={photo.url} alt={`${selectedMatch.otherUser.displayName} photo ${photo.displayOrder + 1}`} />
                          {photo.isPrimary && <div className="photo-primary-badge-small">⭐</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                          <div className="message-content">{msg.content}</div>
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
                  {typingUsers.size > 0 && (
                    <div className="typing-indicator">
                      {selectedMatch.otherUser.displayName} is typing...
                    </div>
                  )}
                  <div className="message-input-wrapper">
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
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type a message..."
                    />
                    <button
                      className="btn btn-primary send-btn"
                      onClick={handleSendMessage}
                      disabled={sendingMessage || !newMessage.trim()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="no-match-selected">
            <div className="no-match-icon">💌</div>
            <h3>Select a match to start chatting</h3>
            <p>Your conversations will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}

