import React, {useEffect, useRef, useState} from "react";
import StreamingAvatarAPI, {
    StreamingEvents,
    TaskType,
    TaskMode,
    VoiceEmotion,
    AvatarQuality
} from "@heygen/streaming-avatar";
import {Video, PaperPlaneRight, Microphone, Globe} from "@phosphor-icons/react";
import {STT_LANGUAGE_LIST, AVATARS} from './constants';
import CustomSelect from './CustomSelect';
import LogEntry from './LogEntry';
import useLogger from './useLogger';

const HeyGenAvatar = () => {
    const [knowledgeId, setKnowledgeId] = useState("");
    const [knowledgeBase, setKnowledgeBase] = useState("");
    const [isLoadingSession, setIsLoadingSession] = useState(false);
    const [stream, setStream] = useState(null);
    const [text, setText] = useState("");
    const [avatarId, setAvatarId] = useState("");
    const [language, setLanguage] = useState('en');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isUserTalking, setIsUserTalking] = useState(false);
    const [mode, setMode] = useState("text"); // "text" за замовчуванням
    const [permissionError, setPermissionError] = useState(null);
    const mediaStream = useRef(null);
    const avatar = useRef(null);
    const [conversation, setConversation] = useState([]);
    const { logs, addLog } = useLogger();
    const stopTalkingListener = useRef(null);
    const recognizedText = useRef(""); // Для збереження розпізнаного тексту

    const handleChangeChatMode = async (newMode) => {
        if (newMode === mode || !avatar.current) return;

        if (newMode === "text") {
            if (mode === "voice") {
                await avatar.current.closeVoiceChat();
            }
            setMode(newMode);
            addLog(`Перемкнуто в режим ${newMode}`);
        } else if (newMode === "voice") {
            try {
                // Перевірте дозвіл мікрофона перед перемиканням
                await navigator.mediaDevices.getUserMedia({ audio: true });

                await avatar.current.startVoiceChat({
                    useSilencePrompt: false,
                    mediaConstraints: {
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    }
                });
                setMode(newMode);
                addLog(`Перемкнуто в режим ${newMode}`);
            } catch (mediaError) {
                addLog(`Помилка доступу до мікрофона: ${mediaError.message}`);
                setPermissionError(mediaError.message);
            }
        }
    };

    async function fetchAccessToken() {
        try {
            const response = await fetch("/api/get-access-token", {
                method: "POST",
            });
            const token = await response.text();
            addLog("Access token retrieved successfully");
            return token;
        } catch (error) {
            addLog(`Error fetching token: ${error.message}`);
            return "";
        }
    }

    // Функція для відправки повідомлення
    const sendMessage = async (message) => {
        if (!avatar.current || !message.trim() || isProcessing) return;

        setIsProcessing(true);
        addLog(`Sending message: "${message}"`);

        // Додаємо повідомлення користувача до історії розмови
        setConversation(prev => [...prev, { role: 'user', content: message }]);

        // Встановлюємо обробник події для відповіді аватара
        const avatarResponsePromise = new Promise((resolve) => {
            stopTalkingListener.current = (event) => {
                resolve(event.text || message);
            };
        });

        await avatar.current.speak({
            text: message,
            taskType: TaskType.TALK,
            taskMode: TaskMode.SYNC
        });

        // Чекаємо відповіді від аватара
        const avatarResponse = await avatarResponsePromise;

        // Додаємо відповідь аватара до історії розмови
        setConversation(prev => [...prev, { role: 'assistant', content: avatarResponse }]);

        setIsProcessing(false);
    };

    async function startSession() {
        setIsLoadingSession(true);

        // Запитуємо доступ до мікрофона тільки якщо хочемо почати в режимі голосу
        if (mode === "voice") {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                setPermissionError(null);
                addLog("Отримано дозвіл на використання мікрофона");
            } catch (mediaError) {
                setPermissionError(mediaError.message);
                addLog(`Помилка доступу до мікрофона: ${mediaError.message}`);
                // Переходимо в текстовий режим при помилці доступу до мікрофона
                setMode("text");
                addLog("Перемикання в текстовий режим через відсутність доступу до мікрофона");
            }
        }

        const token = await fetchAccessToken();
        if (!token) {
            setIsLoadingSession(false);
            return;
        }

        avatar.current = new StreamingAvatarAPI({
            token: token,
        });

        // Event listeners
        avatar.current.on(StreamingEvents.STREAM_READY, (event) => {
            setStream(event.detail);
            addLog("Stream is ready");
        });

        avatar.current.on(StreamingEvents.AVATAR_START_TALKING, () => {
            addLog("Avatar started talking");
            setIsProcessing(true);
        });

        avatar.current.on(StreamingEvents.AVATAR_STOP_TALKING, (event) => {
            addLog(`Avatar stopped talking: ${event.text}`);
            setIsProcessing(false);

            // Якщо є обробник події, викликаємо його з подією
            if (stopTalkingListener.current) {
                stopTalkingListener.current(event);
                stopTalkingListener.current = null; // Очищаємо після виклику
            }
        });

        avatar.current.on(StreamingEvents.USER_START, () => {
            addLog("User started talking");
            setIsUserTalking(true);
            // Скидаємо накопичений текст
            recognizedText.current = "";
        });

        avatar.current.on(StreamingEvents.USER_STOP, () => {
            addLog("User stopped talking");
            setIsUserTalking(false);

            // Якщо в нас є розпізнаний текст, відправляємо його як звичайне текстове повідомлення
            if (recognizedText.current.trim()) {
                addLog(`Processing recognized text: ${recognizedText.current}`);
                // Використовуємо функцію sendMessage для обробки розпізнаного тексту
                sendMessage(recognizedText.current);
                recognizedText.current = "";
            }
        });

        avatar.current.on(StreamingEvents.USER_TALKING_MESSAGE, (message) => {
            addLog(`User message recognized: ${message}`);

            // Зберігаємо розпізнаний текст
            recognizedText.current = message;
        });

        // Змінюємо обробник USER_END_MESSAGE для уникнення прямого виклику speak API
        avatar.current.on(StreamingEvents.USER_END_MESSAGE, (message) => {
            // Просто логуємо подію, але не викликаємо speak безпосередньо
            addLog(`User finished speaking: ${message}`);
            // Повна обробка буде виконана в USER_STOP
        });

        // Обробник помилок API
        avatar.current.on(StreamingEvents.ERROR, (error) => {
            addLog(`API Error: ${error}`);
        });

        addLog(`Creating avatar with ID: ${avatarId}`);

        // Створюємо аватар
        await avatar.current.createStartAvatar({
            quality: AvatarQuality.Low,
            avatarName: avatarId,
            voice: {
                rate: 1.2,
                emotion: VoiceEmotion.NEUTRAL,
            },
            language: language,
            enableChat: true,
            disableIdleTimeout: true,
            knowledgeId: knowledgeId || undefined,
            knowledgeBase: knowledgeBase || undefined,
            useV2VoiceChat: true,
        });

        addLog("Avatar created successfully");

        // Запускаємо голосовий режим, якщо потрібно
        if (mode === "voice") {
            try {
                addLog("Starting voice chat...");
                await avatar.current.startVoiceChat({
                    useSilencePrompt: false,
                    mediaConstraints: {
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    }
                });
                addLog("Voice chat started");
            } catch (voiceChatError) {
                addLog(`Помилка запуску голосового чату: ${voiceChatError.message}`);
                // Перемикаємося в текстовий режим при помилці
                setMode("text");
                addLog("Автоматичне перемикання в текстовий режим через помилку голосового чату");
            }
        } else {
            addLog("Starting in text mode");
        }

        setIsLoadingSession(false);
    }

    async function endSession() {
        // Очищаємо обробник, якщо він був встановлений
        stopTalkingListener.current = null;
        recognizedText.current = "";

        if (avatar.current) {
            await avatar.current.stopAvatar();
            avatar.current = null;
            setStream(null);
            setConversation([]);
            setIsUserTalking(false);
            addLog("Session ended");
        }
    }

    async function handleSpeak() {
        if (!text.trim()) return;
        const message = text.trim();
        setText(''); // Очищаємо поле вводу
        await sendMessage(message);
    }

    useEffect(() => {
        if (!stream || !mediaStream.current) return;

        mediaStream.current.srcObject = stream;
        mediaStream.current.onloadedmetadata = () => {
            mediaStream.current.play();
        };
    }, [stream]);

    useEffect(() => {
        return () => {
            endSession();
        };
    }, []);

    if (!stream) {
        return (
            <div className="flex flex-col h-screen bg-[#0f1117]">
                <div className="grid grid-cols-2 gap-8 p-4">
                    <div className="col-span-2 space-y-4">
                        <div>
                            <p className="text-sm font-medium leading-none text-white mb-2">
                                Knowledge ID (optional)
                            </p>
                            <input
                                type="text"
                                placeholder="Enter Knowledge ID from labs.heygen.com"
                                value={knowledgeId}
                                onChange={(e) => setKnowledgeId(e.target.value)}
                                className="w-full bg-[#1a1f2e] border border-gray-700 rounded px-4 py-2 text-white"
                            />
                        </div>
                        <div>
                            <p className="text-sm font-medium leading-none text-white mb-2">
                                System Prompt (optional)
                            </p>
                            <textarea
                                placeholder="Enter custom system prompt for the avatar"
                                value={knowledgeBase}
                                onChange={(e) => setKnowledgeBase(e.target.value)}
                                rows={3}
                                className="w-full bg-[#1a1f2e] border border-gray-700 rounded px-4 py-2 text-white resize-none"
                            />
                        </div>
                    </div>
                    <CustomSelect
                        label="Avatar Selection"
                        value={avatarId}
                        onChange={setAvatarId}
                        placeholder="Choose your virtual presenter"
                        options={AVATARS}
                        icon={Video}
                    />
                    <CustomSelect
                        label="Language Selection"
                        value={language}
                        onChange={setLanguage}
                        placeholder="English"
                        options={STT_LANGUAGE_LIST}
                        icon={Globe}
                    />
                </div>

                <div className="flex-grow flex items-center justify-center">
                    <div className="text-center text-gray-400">
                        <Video weight="bold" size={48} className="mx-auto mb-4" />
                        <div>Select options and start session</div>
                        <div>to begin interaction</div>
                    </div>
                </div>

                <div className="flex gap-2 mx-4 mb-4">
                    <button
                        className={`flex-1 py-2 px-4 rounded flex items-center justify-center gap-2 ${
                            mode === 'text' ? 'bg-[#2a2f3e] text-white' : 'bg-[#1a1f2e] text-gray-400'
                        }`}
                        onClick={() => setMode('text')}
                    >
                        <PaperPlaneRight size={20} /> Text Mode
                    </button>
                    <button
                        className={`flex-1 py-2 px-4 rounded flex items-center justify-center gap-2 ${
                            mode === 'voice' ? 'bg-[#2a2f3e] text-white' : 'bg-[#1a1f2e] text-gray-400'
                        }`}
                        onClick={() => setMode('voice')}
                    >
                        <Microphone size={20} /> Voice Mode
                    </button>
                </div>

                {permissionError && (
                    <div className="p-4 mx-4 mb-4 bg-red-500 text-white rounded">
                        <p className="font-bold">Помилка доступу до мікрофона: {permissionError}</p>
                        <p>Будь ласка, надайте дозвіл на використання мікрофона в налаштуваннях браузера.</p>
                    </div>
                )}

                <div className="p-4">
                    <button
                        onClick={startSession}
                        disabled={!avatarId || isLoadingSession}
                        className="w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoadingSession ? "Starting..." : "Start Session"}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[#0f1117]">
            <div className="relative flex-1 bg-[#0f1117] flex items-center justify-center">
                <div className="w-[70%] aspect-video relative bg-green-500">
                    <video
                        ref={mediaStream}
                        className="w-full h-full object-contain bg-black"
                        autoPlay
                        playsInline
                    />
                    <button
                        onClick={endSession}
                        className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-8 py-2 rounded hover:bg-red-700"
                    >
                        End Session
                    </button>
                </div>
            </div>

            {permissionError && (
                <div className="mx-4 mt-2 p-4 bg-red-500 text-white rounded">
                    <p className="font-bold">Помилка доступу до мікрофона: {permissionError}</p>
                    <p>Будь ласка, надайте дозвіл на використання мікрофона в налаштуваннях браузера.</p>
                </div>
            )}

            <div className="p-4 bg-[#1a1f2e]">
                <div className="flex gap-2 mb-4">
                    <button
                        className={`flex-1 py-2 px-4 rounded flex items-center justify-center gap-2 ${
                            mode === 'text' ? 'bg-[#2a2f3e] text-white' : 'text-gray-400'
                        }`}
                        onClick={() => handleChangeChatMode('text')}
                    >
                        <PaperPlaneRight size={20} /> Text Mode
                    </button>
                    <button
                        className={`flex-1 py-2 px-4 rounded flex items-center justify-center gap-2 ${
                            mode === 'voice' ? 'bg-[#2a2f3e] text-white' : 'text-gray-400'
                        }`}
                        onClick={() => handleChangeChatMode('voice')}
                    >
                        <Microphone size={20} /> Voice Mode
                    </button>
                </div>

                <div className="flex gap-2">
                    {mode === 'text' ? (
                        <>
                            <input
                                type="text"
                                placeholder="Type your message here..."
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyUp={(e) => e.key === 'Enter' && handleSpeak()}
                                className="flex-1 bg-[#2a2f3e] border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                                disabled={isProcessing}
                            />
                            <button
                                onClick={handleSpeak}
                                disabled={!text.trim() || isProcessing}
                                className="bg-[#2a2f3e] text-white p-2 rounded aspect-square hover:bg-[#3a3f4e] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <PaperPlaneRight size={24} />
                            </button>
                        </>
                    ) : (
                        <div className="w-full text-center">
                            <div className={`w-full py-2 px-4 rounded flex items-center justify-center gap-2 ${
                                isUserTalking
                                    ? 'bg-red-500 text-white'
                                    : 'bg-[#2a2f3e] text-white'
                            }`}>
                                <Microphone size={24} className={isUserTalking ? 'animate-pulse' : ''} />
                                {isUserTalking ? (
                                    <>Listening: {recognizedText.current}</>
                                ) : (
                                    'Voice Chat Active'
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <div className="text-sm text-gray-400 mb-2">Activity Log</div>
                    <div className="bg-[#2a2f3e] rounded p-2 h-32 overflow-y-auto">
                        {logs.map((log, index) => (
                            <LogEntry key={index} {...log} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HeyGenAvatar;