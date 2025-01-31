import React, { useEffect, useRef, useState } from "react";
import StreamingAvatarAPI, {
    StreamingEvents,
    TaskType,
    TaskMode,
    VoiceEmotion,
    AvatarQuality
} from "@heygen/streaming-avatar";
import { Video, PaperPlaneRight, Microphone, Globe } from "@phosphor-icons/react";
import { STT_LANGUAGE_LIST, AVATARS } from './constants';
import { CustomSelect } from './CustomSelect';
import { LogEntry } from './LogEntry';
import { useLogger } from './useLogger';

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
    const [mode, setMode] = useState("voice");
    const mediaStream = useRef(null);
    const avatar = useRef(null);
    const [conversation, setConversation] = useState([]);
    const { logs, addLog } = useLogger();

    const handleChangeChatMode = async (newMode) => {
        if (newMode === mode) return;

        try {
            if (newMode === "text") {
                await avatar.current?.closeVoiceChat();
            } else {
                await avatar.current?.startVoiceChat({
                    useSilencePrompt: false
                });
            }
            setMode(newMode);
            addLog(`Switched to ${newMode} mode`);
        } catch (error) {
            console.error(`Error changing mode: ${error.message}`);
            addLog(`Error changing mode: ${error.message}`);
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
            console.error("Error fetching access token:", error);
            addLog(`Error fetching token: ${error.message}`);
            return "";
        }
    }

    async function startSession() {
        setIsLoadingSession(true);
        try {
            const token = await fetchAccessToken();
            if (!token) throw new Error("Failed to get access token");

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
            });

            avatar.current.on(StreamingEvents.USER_START, () => {
                addLog("User started talking");
                setIsUserTalking(true);
            });

            avatar.current.on(StreamingEvents.USER_STOP, () => {
                addLog("User stopped talking");
                setIsUserTalking(false);
            });

            avatar.current.on(StreamingEvents.USER_TALKING_MESSAGE, (message) => {
                addLog(`User message: ${message}`);
                if (mode === "voice") {
                    setConversation(prev => [...prev, { role: 'user', content: message }]);
                }
            });

            avatar.current.on(StreamingEvents.USER_END_MESSAGE, async (message) => {
                if (mode === "voice") {
                    addLog("Processing voice message");
                    try {
                        await avatar.current.speak({
                            text: message,
                            taskType: TaskType.CHAT,
                            taskMode: TaskMode.ASYNC,
                            chatHistory: conversation
                        });
                    } catch (error) {
                        addLog(`Error processing voice message: ${error.message}`);
                    }
                }
            });

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
            });

            // Start in voice mode by default
            await avatar.current?.startVoiceChat({
                useSilencePrompt: false
            });
            setMode("voice");
            addLog("Voice chat started");

        } catch (error) {
            console.error("Error:", error);
            addLog(`Error: ${error.message}`);
        } finally {
            setIsLoadingSession(false);
        }
    }

    async function endSession() {
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
        if (!avatar.current || !text.trim() || isProcessing) return;

        try {
            setIsProcessing(true);
            const userMessage = text.trim();
            addLog(`Speaking: "${userMessage}"`);

            setConversation(prev => [...prev, { role: 'user', content: userMessage }]);
            setText('');

            await avatar.current.speak({
                text: userMessage,
                taskType: TaskType.CHAT,
                taskMode: TaskMode.ASYNC,
                chatHistory: conversation
            });

            const avatarResponse = await new Promise((resolve) => {
                avatar.current.once(StreamingEvents.AVATAR_STOP_TALKING, (event) => {
                    resolve(event.text || userMessage);
                });
            });

            setConversation(prev => [...prev, { role: 'assistant', content: avatarResponse }]);

        } catch (error) {
            console.error("Error speaking:", error);
            addLog(`Error speaking: ${error.message}`);
            setIsProcessing(false);
        }
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
                                onKeyPress={(e) => e.key === 'Enter' && handleSpeak()}
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
                                {isUserTalking ? 'Listening...' : 'Voice Chat Active'}
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