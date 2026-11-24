/**
 * نافذة المحادثة المباشرة الشاملة عبر WebSocket:
 * - محادثة المطعم المثبتة دائماً في الأعلى للعميل أو الزائر
 * - قائمة بحث فورية باليوزر (@username) ومحادثات خاصة مباشرة مع أي مستخدم
 * - قائمة الـ 3 شحطات (≡) بجانب الشات لفتح لعبة إكس أوه (X / O) المباشرة أو التنقل بين المحادثات
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Gamepad2,
  Loader2,
  Menu,
  MessageCircle,
  Pin,
  RotateCcw,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useSite } from '../context/SiteContext';
import { getOrCreateDeviceId } from '../hooks/useCart';
import type { ChatMessage, ChatThread, TicTacToeGameState } from '../types/menu';
import { UserAvatar } from './UserAvatar';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

interface PublicUserHit {
  username: string;
  name: string;
  avatar?: string;
  bio?: string;
  exactMatch?: boolean;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  onUnreadChange,
}) => {
  const { siteConfig, auth, apiFetch, subscribeWs, sendWsPayload } = useSite();
  const guestId = useMemo(() => getOrCreateDeviceId(), []);

  const myEmail = useMemo(() => {
    const email = auth.user?.email || (auth.role === 'admin' ? auth.adminEmail : null);
    return email ? email.trim().toLowerCase() : null;
  }, [auth.user?.email, auth.role, auth.adminEmail]);

  const restaurantThreadId = useMemo(() => {
    if (myEmail) return `user:${myEmail}`;
    return `guest:${guestId}`;
  }, [myEmail, guestId]);

  const [activeThreadId, setActiveThreadId] = useState<string>(restaurantThreadId);
  const [restaurantThread, setRestaurantThread] = useState<ChatThread | null>(null);
  const [dmThreads, setDmThreads] = useState<ChatThread[]>([]);
  const [activeThreadData, setActiveThreadData] = useState<ChatThread | null>(null);

  const [inputText, setInputText] = useState('');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // قائمة البحث باليوزر والشاتات الأخرى
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<PublicUserHit[]>([]);
  const [exactMatchUser, setExactMatchUser] = useState<PublicUserHit | null>(null);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [openingDm, setOpeningDm] = useState<string | null>(null);

  // قائمة الـ 3 شحطات + لعبة إكس أوه (X / O) المباشرة
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMobileList, setShowMobileList] = useState(false);
  const [showGamePanel, setShowGamePanel] = useState(false);
  const [gameBusy, setGameBusy] = useState(false);
  const [gameError, setGameError] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveThreadId((prev) => {
      if (prev.startsWith('dm:') && myEmail) return prev;
      return restaurantThreadId;
    });
  }, [restaurantThreadId, myEmail]);

  const activeThread = useMemo<ChatThread | null>(() => {
    if (activeThreadId === restaurantThreadId) {
      return activeThreadData?.threadId === restaurantThreadId ? activeThreadData : restaurantThread;
    }
    return (
      dmThreads.find((t) => t.threadId === activeThreadId) ||
      (activeThreadData?.threadId === activeThreadId ? activeThreadData : null)
    );
  }, [activeThreadId, restaurantThreadId, restaurantThread, dmThreads, activeThreadData]);

  const messages: ChatMessage[] = activeThread?.messages || [];
  const activeGame: TicTacToeGameState | null = activeThread?.game || null;

  const getDmPartnerInfo = useCallback(
    (thread: ChatThread) => {
      const partnerEmail =
        thread.participants?.find((p) => p.toLowerCase() !== myEmail) ||
        thread.participants?.[0] ||
        '';
      const partnerName =
        thread.participantNames?.[partnerEmail] || thread.customerName || 'مستخدم';
      const partnerUsername = thread.participantUsernames?.[partnerEmail] || '';
      const partnerAvatar = thread.participantAvatars?.[partnerEmail] || '';
      return { partnerEmail, partnerName, partnerUsername, partnerAvatar };
    },
    [myEmail]
  );

  // الاشتراك المباشر بالمحادثة الحالية في WebSocket
  useEffect(() => {
    sendWsPayload({ type: 'subscribe_thread', threadId: activeThreadId });
  }, [activeThreadId, sendWsPayload]);

  // تحميل قائمة المحادثات (المثبتة + الخاصة) عند فتح النافذة
  const loadThreadsOverview = useCallback(async () => {
    if (!isOpen) return;
    if (myEmail) {
      try {
        const res = await apiFetch('/api/chat/threads', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as {
            restaurantThread?: ChatThread;
            dmThreads?: ChatThread[];
          };
          if (data.restaurantThread) setRestaurantThread(data.restaurantThread);
          if (data.dmThreads) setDmThreads(data.dmThreads);
        }
      } catch {
        // تجاهل الخطأ المؤقت
      }
    } else {
      setDmThreads([]);
    }
  }, [isOpen, myEmail, apiFetch]);

  useEffect(() => {
    loadThreadsOverview();
  }, [loadThreadsOverview]);

  // تحميل تفاصيل المحادثة المحددة وتصفير الإشعارات غير المقروءة
  useEffect(() => {
    let active = true;
    const loadSelectedThread = async () => {
      if (!isOpen) return;
      setLoading(true);
      setGameError('');
      try {
        const res = await apiFetch(
          `/api/chat/thread?threadId=${encodeURIComponent(activeThreadId)}`,
          { cache: 'no-store' }
        );
        if (res.ok && active) {
          const data = (await res.json()) as { thread?: ChatThread };
          if (data.thread) {
            setActiveThreadData(data.thread);
            if (data.thread.threadId === restaurantThreadId) {
              setRestaurantThread(data.thread);
            } else if (data.thread.threadType === 'dm') {
              setDmThreads((prev) => {
                const exists = prev.some((t) => t.threadId === data.thread!.threadId);
                return exists
                  ? prev.map((t) => (t.threadId === data.thread!.threadId ? data.thread! : t))
                  : [data.thread!, ...prev];
              });
            }
            if (data.thread.game && data.thread.game.status === 'playing') {
              setShowGamePanel(true);
            }
            if (onUnreadChange) onUnreadChange(0);
            apiFetch('/api/chat/read', {
              method: 'POST',
              body: JSON.stringify({ threadId: data.thread.threadId }),
            }).catch(() => {});
          }
        }
      } catch {
        // تجاهل الخطأ المؤقت
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSelectedThread();
    return () => {
      active = false;
    };
  }, [isOpen, activeThreadId, restaurantThreadId, apiFetch, onUnreadChange]);

  // البحث باليوزر عبر الخادم
  useEffect(() => {
    if (!isOpen || !myEmail) {
      setSearchResults([]);
      setExactMatchUser(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
          cache: 'no-store',
        });
        if (res.ok && active) {
          const data = (await res.json()) as {
            users?: PublicUserHit[];
            exactMatch?: PublicUserHit | null;
          };
          setSearchResults(data.users || []);
          setExactMatchUser(data.exactMatch || null);
        }
      } catch {
        // تجاهل
      } finally {
        if (active) setSearchingUsers(false);
      }
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, myEmail, searchQuery, apiFetch]);

  // الاستماع للتحديثات الفورية عبر WebSocket (رسائل + لعبة X/O)
  useEffect(() => {
    return subscribeWs((evt) => {
      if ((evt.type === 'chat:message' || evt.type === 'chat:game' || evt.type === 'chat:read') && evt.thread) {
        const updated = evt.thread;
        if (updated.threadId === restaurantThreadId) {
          setRestaurantThread(updated);
        } else if (updated.threadType === 'dm' || updated.threadId.startsWith('dm:')) {
          setDmThreads((prev) => {
            const others = prev.filter((t) => t.threadId !== updated.threadId);
            return [updated, ...others];
          });
        }

        if (updated.threadId === activeThreadId) {
          setActiveThreadData(updated);
          if (evt.type === 'chat:game') {
            setShowGamePanel(true);
          }
          if (isOpen && evt.type === 'chat:message') {
            apiFetch('/api/chat/read', {
              method: 'POST',
              body: JSON.stringify({ threadId: updated.threadId }),
            }).catch(() => {});
            if (onUnreadChange) onUnreadChange(0);
          }
        } else if (!isOpen && evt.type === 'chat:message' && onUnreadChange) {
          if (updated.threadId === restaurantThreadId && evt.message?.senderRole === 'admin') {
            onUnreadChange(updated.unreadByCustomer || 1);
          } else if (
            myEmail &&
            updated.threadType === 'dm' &&
            evt.message?.senderEmail?.toLowerCase() !== myEmail
          ) {
            onUnreadChange(updated.unreadByUser?.[myEmail] || 1);
          }
        }
      }
    });
  }, [subscribeWs, restaurantThreadId, activeThreadId, isOpen, myEmail, apiFetch, onUnreadChange]);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeThreadId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuOpen) setMenuOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, menuOpen, onClose]);

  const handleOpenDmWithUser = async (username: string) => {
    if (!username || openingDm) return;
    setOpeningDm(username);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/chat/dm/open', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      const data = (await res.json()) as { ok?: boolean; thread?: ChatThread; error?: string };
      if (!res.ok || !data.ok || !data.thread) {
        setErrorMsg(data.error || 'تعذر فتح المحادثة مع هذا المستخدم');
      } else {
        setDmThreads((prev) => {
          const exists = prev.some((t) => t.threadId === data.thread!.threadId);
          return exists ? prev : [data.thread!, ...prev];
        });
        setActiveThreadId(data.thread.threadId);
        setActiveThreadData(data.thread);
        setSearchQuery('');
        setShowMobileList(false);
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم');
    } finally {
      setOpeningDm(null);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputText.trim();
    if (!cleaned || sending) return;

    setSending(true);
    setErrorMsg('');
    try {
      const res = await apiFetch('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({
          threadId: activeThreadId,
          text: cleaned,
          senderName: auth.user?.name || guestName.trim() || 'زائر الموقع',
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        thread?: ChatThread;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.thread) {
        setErrorMsg(data.error || 'تعذر إرسال الرسالة');
      } else {
        setInputText('');
        setActiveThreadData(data.thread);
        if (data.thread.threadId === restaurantThreadId) {
          setRestaurantThread(data.thread);
        } else if (data.thread.threadType === 'dm') {
          setDmThreads((prev) => {
            const others = prev.filter((t) => t.threadId !== data.thread!.threadId);
            return [data.thread!, ...others];
          });
        }
      }
    } catch {
      setErrorMsg('تعذر الاتصال بالخادم');
    } finally {
      setSending(false);
    }
  };

  const myPlayerId = useMemo(() => {
    if (activeThreadId.startsWith('dm:')) return myEmail || '';
    if (activeThreadId.startsWith('user:')) return myEmail || '';
    return `guest:${guestId}`;
  }, [activeThreadId, myEmail, guestId]);

  const handleStartGame = async () => {
    if (gameBusy) return;
    setGameBusy(true);
    setGameError('');
    try {
      const res = await apiFetch('/api/chat/game/start', {
        method: 'POST',
        body: JSON.stringify({
          threadId: activeThreadId,
          guestId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; thread?: ChatThread; error?: string };
      if (!res.ok || !data.ok || !data.thread) {
        setGameError(data.error || 'تعذر بدء اللعبة');
      } else {
        setActiveThreadData(data.thread);
        if (data.thread.threadId === restaurantThreadId) {
          setRestaurantThread(data.thread);
        } else if (data.thread.threadType === 'dm') {
          setDmThreads((prev) =>
            prev.map((t) => (t.threadId === data.thread!.threadId ? data.thread! : t))
          );
        }
      }
    } catch {
      setGameError('تعذر الاتصال بالخادم');
    } finally {
      setGameBusy(false);
    }
  };

  const handleGameMove = async (cellIndex: number) => {
    if (gameBusy) return;
    setGameBusy(true);
    setGameError('');
    try {
      const res = await apiFetch('/api/chat/game/move', {
        method: 'POST',
        body: JSON.stringify({
          threadId: activeThreadId,
          cellIndex,
          guestId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; thread?: ChatThread; error?: string };
      if (!res.ok || !data.ok || !data.thread) {
        setGameError(data.error || 'تعذر تنفيذ الحركة');
      } else {
        setActiveThreadData(data.thread);
        if (data.thread.threadId === restaurantThreadId) {
          setRestaurantThread(data.thread);
        } else if (data.thread.threadType === 'dm') {
          setDmThreads((prev) =>
            prev.map((t) => (t.threadId === data.thread!.threadId ? data.thread! : t))
          );
        }
      }
    } catch {
      setGameError('تعذر الاتصال بالخادم');
    } finally {
      setGameBusy(false);
    }
  };

  const isDmActive = activeThreadId.startsWith('dm:');
  const activePartner = useMemo(() => {
    if (!isDmActive || !activeThread) return null;
    return getDmPartnerInfo(activeThread);
  }, [isDmActive, activeThread, getDmPartnerInfo]);

  const myGameSymbol: 'X' | 'O' | null = useMemo(() => {
    if (!activeGame) return null;
    if (activeGame.playerX.id === myPlayerId) return 'X';
    if (activeGame.playerO.id === myPlayerId) return 'O';
    return null;
  }, [activeGame, myPlayerId]);

  const isMyTurn = Boolean(
    activeGame &&
      activeGame.status === 'playing' &&
      myGameSymbol &&
      activeGame.turn === myGameSymbol
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 safari-blur p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-drawer-title"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 22, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="w-full sm:max-w-4xl h-[90dvh] sm:h-[660px] flex rounded-t-3xl sm:rounded-3xl bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-[var(--shadow-modal)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* الشريط الجانبي: المطعم مثبت دائماً + بحث باليوزر + شاتات آخرين */}
            <aside
              className={`${
                showMobileList ? 'flex fixed inset-0 z-20 sm:static' : 'hidden md:flex'
              } w-full md:w-80 flex-col bg-[var(--bg-canvas)] border-l border-[var(--border-hairline)] shrink-0`}
            >
              <div className="p-4 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                  <span className="font-display font-black text-sm">المحادثات والبحث</span>
                </div>
                {showMobileList && (
                  <button
                    type="button"
                    onClick={() => setShowMobileList(false)}
                    className="md:hidden min-h-[36px] min-w-[36px] rounded-xl bg-[var(--bg-surface)] flex items-center justify-center"
                    aria-label="إغلاق قائمة المحادثات"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* المطعم مثبت دائماً في الأعلى */}
              <div className="p-3 border-b border-[var(--border-hairline)]">
                <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[var(--accent-gold)] mb-2 px-1">
                  <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>مثبت دائماً</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveThreadId(restaurantThreadId);
                    setShowMobileList(false);
                  }}
                  className={`w-full text-right p-3 rounded-2xl border transition-colors ${
                    activeThreadId === restaurantThreadId
                      ? 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-black text-sm truncate">
                      مطعم {siteConfig.restaurant.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--accent-gold-soft)] text-[var(--accent-gold)] text-[10px] font-black shrink-0">
                      مثبت
                    </span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] truncate mt-1">
                    {restaurantThread?.messages?.slice(-1)[0]?.text ||
                      'محادثة المطعم الرسمية للطلبات والاستفسارات'}
                  </div>
                </button>
              </div>

              {/* قائمة بحث عن يوزر شخص + قائمة الأشخاص */}
              <div className="p-3 border-b border-[var(--border-hairline)] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-[var(--text-secondary)]">
                    إرسال لأي شخص عبر اليوزر
                  </div>
                  {myEmail && (
                    <button
                      type="button"
                      onClick={() => setSearchFocused((v) => !v)}
                      className="text-[11px] font-bold text-[var(--accent-gold)] hover:underline"
                    >
                      {searchFocused ? 'إخفاء القائمة' : `قائمة الأشخاص (${searchResults.length})`}
                    </button>
                  )}
                </div>

                {myEmail ? (
                  <>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (exactMatchUser) {
                          handleOpenDmWithUser(exactMatchUser.username);
                        } else if (searchResults.length === 1) {
                          handleOpenDmWithUser(searchResults[0].username);
                        }
                      }}
                      className="relative"
                    >
                      <Search
                        className="w-4 h-4 text-[var(--text-muted)] absolute right-3 top-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onFocus={() => setSearchFocused(true)}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setSearchFocused(true);
                        }}
                        placeholder="اكتب اليوزر كاملاً أو ابحث في القائمة"
                        className="w-full min-h-[42px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] pr-9 pl-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                      />
                    </form>

                    {/* نتيجة التطابق التام عند كتابة اليوزر كاملاً */}
                    {exactMatchUser && (
                      <button
                        type="button"
                        disabled={openingDm === exactMatchUser.username}
                        onClick={() => handleOpenDmWithUser(exactMatchUser.username)}
                        className="w-full text-right p-2.5 rounded-2xl bg-[var(--accent-fire-soft)] border border-[var(--accent-fire)] flex items-center justify-between gap-2.5 transition-all hover:brightness-105"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar
                            avatar={exactMatchUser.avatar}
                            name={exactMatchUser.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-[10px] font-black text-[var(--accent-gold)]">
                              تطابق تام مع اليوزر
                            </div>
                            <div className="text-xs font-extrabold truncate">{exactMatchUser.name}</div>
                            <div
                              dir="ltr"
                              className="text-[11px] font-mono text-[var(--text-secondary)] truncate text-right"
                            >
                              @{exactMatchUser.username}
                            </div>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-xl bg-[var(--accent-fire)] text-white text-[11px] font-black shrink-0">
                          {openingDm === exactMatchUser.username ? 'جاري الفتح' : 'مراسلة الآن'}
                        </span>
                      </button>
                    )}

                    {/* قائمة الأشخاص عند البحث أو فتح القائمة */}
                    {(searchFocused || searchQuery.trim().length > 0) && (
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
                        {searchingUsers && searchResults.length === 0 ? (
                          <div className="text-[11px] text-[var(--text-muted)] py-2 text-center">
                            جاري تحميل قائمة الأشخاص
                          </div>
                        ) : searchResults.length === 0 ? (
                          <div className="text-[11px] text-[var(--text-muted)] py-2 text-center">
                            لا يوجد مستخدم مطابق لهذا اليوزر
                          </div>
                        ) : (
                          searchResults
                            .filter((hit) => !exactMatchUser || hit.username !== exactMatchUser.username)
                            .map((hit) => (
                              <button
                                key={hit.username}
                                type="button"
                                disabled={openingDm === hit.username}
                                onClick={() => handleOpenDmWithUser(hit.username)}
                                className="w-full text-right px-2.5 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-between gap-2 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <UserAvatar
                                    avatar={hit.avatar}
                                    name={hit.name}
                                    size="sm"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold truncate">{hit.name}</div>
                                    <div
                                      dir="ltr"
                                      className="text-[11px] font-mono text-[var(--accent-gold)] truncate text-right"
                                    >
                                      @{hit.username}
                                    </div>
                                    {hit.bio && (
                                      <div className="text-[10px] text-[var(--text-muted)] truncate">
                                        {hit.bio}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[11px] font-extrabold text-[var(--accent-fire)] shrink-0">
                                  {openingDm === hit.username ? 'فتح' : 'مراسلة'}
                                </span>
                              </button>
                            ))
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-dashed border-[var(--border-hairline)] text-[11px] text-[var(--text-muted)] leading-relaxed">
                    سجّل الدخول بحسابك لتختار يوزرك وتبحث عن الأشخاص وتراسلهم مباشرة
                  </div>
                )}
              </div>

              {/* قائمة المحادثات الأخرى */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="text-xs font-extrabold text-[var(--text-muted)] px-1">
                  محادثات الأشخاص ({dmThreads.length})
                </div>
                {dmThreads.length === 0 ? (
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-dashed border-[var(--border-hairline)] text-xs text-[var(--text-muted)] text-center">
                    ابحث عن أي يوزر بالأعلى أو اختره من قائمة الأشخاص لبدء محادثة جديدة معه
                  </div>
                ) : (
                  dmThreads.map((t) => {
                    const info = getDmPartnerInfo(t);
                    const unread = myEmail ? t.unreadByUser?.[myEmail] || 0 : 0;
                    const selected = activeThreadId === t.threadId;
                    const lastMsg = t.messages[t.messages.length - 1];
                    return (
                      <button
                        key={t.threadId}
                        type="button"
                        onClick={() => {
                          setActiveThreadId(t.threadId);
                          setShowMobileList(false);
                        }}
                        className={`w-full text-right p-2.5 rounded-2xl border transition-colors flex items-center gap-2.5 ${
                          selected
                            ? 'bg-[var(--bg-subtle)] border-[var(--accent-gold)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <UserAvatar
                          avatar={info.partnerAvatar}
                          name={info.partnerName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm truncate">{info.partnerName}</span>
                            {unread > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-[var(--accent-fire)] text-white text-[10px] font-black">
                                {unread}
                              </span>
                            )}
                          </div>
                          {info.partnerUsername && (
                            <div
                              dir="ltr"
                              className="text-[11px] font-mono text-[var(--accent-gold)] text-right mt-0.5"
                            >
                              @{info.partnerUsername}
                            </div>
                          )}
                          <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                            {lastMsg?.text || 'ابدأ المحادثة الآن'}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* منطقة المحادثة النشطة والـ 3 شحطات + لعبة إكس أوه */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2 shrink-0 relative">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* زر 3 شحطات بجانب الشات لفتح الخيارات ولعبة إكس أوه */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((prev) => !prev)}
                      aria-label="قائمة خيارات الشات ولعبة إكس أوه"
                      aria-expanded={menuOpen}
                      className={`min-h-[42px] min-w-[42px] rounded-xl flex items-center justify-center border transition-colors relative ${
                        menuOpen || showGamePanel
                          ? 'bg-[var(--accent-fire-soft)] border-[var(--accent-fire)] text-[var(--accent-gold)]'
                          : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)] text-[var(--text-primary)]'
                      }`}
                    >
                      <Menu className="w-5 h-5" />
                      {activeGame?.status === 'playing' && (
                        <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-[var(--accent-gold)]" />
                      )}
                    </button>

                    {menuOpen && (
                      <div className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] shadow-[var(--shadow-modal)] p-2 z-30 space-y-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowGamePanel((v) => !v);
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-3 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] flex items-center justify-between gap-2 text-sm font-bold"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Gamepad2 className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                            <span>لعبة إكس أوه (X / O)</span>
                          </span>
                          <span className="text-[11px] font-black text-[var(--accent-fire)]">
                            {showGamePanel ? 'إخفاء' : 'فتح'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowMobileList(true);
                            setMenuOpen(false);
                          }}
                          className="w-full md:hidden text-right px-3 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-sm font-bold"
                        >
                          <Search className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                          <span>البحث باليوزر والمحادثات</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveThreadId(restaurantThreadId);
                            setMenuOpen(false);
                          }}
                          className="w-full text-right px-3 py-2.5 rounded-xl hover:bg-[var(--bg-subtle)] flex items-center justify-between gap-2 text-sm font-bold"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Pin className="w-4 h-4 text-[var(--accent-gold)]" aria-hidden="true" />
                            <span>العودة لمطعم {siteConfig.restaurant.name}</span>
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isDmActive && activePartner && (
                    <UserAvatar
                      avatar={activePartner.partnerAvatar}
                      name={activePartner.partnerName}
                      size="sm"
                    />
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2
                        id="chat-drawer-title"
                        className="font-display font-black text-base sm:text-lg leading-tight truncate"
                      >
                        {isDmActive
                          ? activePartner?.partnerName || 'محادثة خاصة'
                          : `مطعم ${siteConfig.restaurant.name}`}
                      </h2>
                      {!isDmActive && (
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--accent-gold-soft)] text-[var(--accent-gold)] text-[10px] font-black shrink-0">
                          مثبت دائماً
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {isDmActive && activePartner?.partnerUsername
                        ? `@${activePartner.partnerUsername}`
                        : 'تواصل مباشر فوري مع إمكانية اللعب معاً'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowMobileList(true)}
                    aria-label="عرض البحث والمحادثات"
                    className="md:hidden min-h-[42px] px-3 rounded-xl bg-[var(--bg-subtle)] text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Users className="w-4 h-4 text-[var(--accent-gold)]" />
                    <span>الكل</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="إغلاق المحادثة"
                    className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-primary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* لوحة لعبة إكس أوه (X / O) المباشرة بين المتحدثين */}
              {showGamePanel && (
                <div className="p-4 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] space-y-3 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-display font-black text-sm text-[var(--accent-gold)]">
                      <Gamepad2 className="w-4 h-4" aria-hidden="true" />
                      <span>لعبة إكس أوه المباشرة</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={gameBusy}
                        onClick={handleStartGame}
                        className="min-h-[34px] px-3 rounded-xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] text-white text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-60"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{activeGame ? 'جولة جديدة' : 'ابدأ اللعب'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGamePanel(false)}
                        className="min-h-[34px] px-2.5 rounded-xl bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-secondary)]"
                      >
                        إغلاق اللعبة
                      </button>
                    </div>
                  </div>

                  {!activeGame ? (
                    <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-dashed border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] text-center">
                      اضغط "ابدأ اللعب" لبدء جولة X / O مباشرة مع{' '}
                      {isDmActive
                        ? activePartner?.partnerName || 'صديقك'
                        : `مطعم ${siteConfig.restaurant.name}`}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)]">
                          <div className="font-black text-[var(--accent-fire)]">
                            X ({activeGame.playerX.label})
                          </div>
                          <div className="font-mono font-bold mt-0.5">{activeGame.xWins} فوز</div>
                        </div>
                        <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)]">
                          <div className="font-bold text-[var(--text-muted)]">تعادل</div>
                          <div className="font-mono font-bold mt-0.5">{activeGame.draws}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)]">
                          <div className="font-black text-[var(--accent-gold)]">
                            O ({activeGame.playerO.label})
                          </div>
                          <div className="font-mono font-bold mt-0.5">{activeGame.oWins} فوز</div>
                        </div>
                      </div>

                      <div className="text-center text-xs font-extrabold">
                        {activeGame.status === 'won' ? (
                          <span className="text-[var(--accent-gold)]">
                            الفائز في هذه الجولة:{' '}
                            {activeGame.winner === 'X'
                              ? activeGame.playerX.label
                              : activeGame.playerO.label}
                          </span>
                        ) : activeGame.status === 'draw' ? (
                          <span className="text-[var(--text-secondary)]">انتهت الجولة بالتعادل</span>
                        ) : isMyTurn ? (
                          <span className="text-emerald-300">
                            دورك الآن (أنت تلعب بحرف {myGameSymbol})
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">
                            بانتظار حركة{' '}
                            {activeGame.turn === 'X'
                              ? activeGame.playerX.label
                              : activeGame.playerO.label}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 w-48 sm:w-52 mx-auto" dir="ltr">
                        {activeGame.board.map((cell, idx) => {
                          const isWinCell = activeGame.winningLine?.includes(idx) || false;
                          const canPlay =
                            activeGame.status === 'playing' && isMyTurn && cell === null && !gameBusy;
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={!canPlay}
                              onClick={() => handleGameMove(idx)}
                              aria-label={`خانة ${idx + 1}`}
                              className={`h-14 sm:h-16 rounded-2xl border font-display font-black text-2xl flex items-center justify-center transition-all ${
                                isWinCell
                                  ? 'bg-[var(--accent-gold-soft)] border-[var(--accent-gold)]'
                                  : canPlay
                                    ? 'bg-[var(--bg-surface)] border-[var(--border-strong)] hover:border-[var(--accent-gold)]'
                                    : 'bg-[var(--bg-surface)] border-[var(--border-hairline)]'
                              } ${
                                cell === 'X'
                                  ? 'text-[var(--accent-fire)]'
                                  : cell === 'O'
                                    ? 'text-[var(--accent-gold)]'
                                    : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {cell || ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {gameError && (
                    <div className="text-center text-xs font-bold text-[var(--accent-fire)]">
                      {gameError}
                    </div>
                  )}
                </div>
              )}

              {!auth.user && !isDmActive && (
                <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)] shrink-0">
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="اكتب اسمك هنا لتمييز رسائلك"
                    className="w-full min-h-[42px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  />
                </div>
              )}

              {/* الرسائل */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading && messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)] gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>جاري تحميل المحادثة</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-sm text-[var(--text-secondary)]">
                    <MessageCircle
                      className="w-10 h-10 mb-3 text-[var(--accent-gold)] opacity-80"
                      aria-hidden="true"
                    />
                    <p className="font-bold text-[var(--text-primary)] mb-1">
                      {isDmActive
                        ? `محادثة مباشرة مع ${activePartner?.partnerName || 'المستخدم'}`
                        : `أهلاً بك في مطعم ${siteConfig.restaurant.name}`}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      يمكنك الدردشة فوراً أو الضغط على الـ 3 شحطات بالأعلى لفتح لعبة إكس أوه واللعب معاً
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = isDmActive
                      ? Boolean(myEmail && msg.senderEmail?.toLowerCase() === myEmail)
                      : msg.senderRole === 'customer';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] ${
                          isMine ? 'mr-auto items-end' : 'ml-auto items-start'
                        }`}
                      >
                        <span className="text-[11px] text-[var(--text-muted)] mb-1 px-1">
                          {msg.senderLabel}
                        </span>
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                            isMine
                              ? 'bg-[var(--accent-fire)] text-white rounded-tl-sm'
                              : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-hairline)] rounded-tr-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={handleSend}
                className="p-3 sm:p-4 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] pb-safe space-y-2 shrink-0"
              >
                {errorMsg && (
                  <div className="text-xs font-bold text-[var(--accent-fire)]">{errorMsg}</div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    maxLength={1000}
                    placeholder={
                      isDmActive && activePartner
                        ? `أرسل رسالة إلى ${activePartner.partnerName}`
                        : 'اكتب رسالتك هنا'
                    }
                    className="flex-1 min-h-[46px] rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-4 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !inputText.trim()}
                    aria-label="إرسال الرسالة"
                    className="min-h-[46px] min-w-[46px] px-4 rounded-2xl bg-[var(--accent-fire)] hover:bg-[var(--accent-fire-hover)] disabled:opacity-50 text-white flex items-center justify-center transition-colors"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="w-5 h-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
