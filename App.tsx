import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob, Chat } from '@google/genai';
import type { Content } from '@google/genai';
import { Message, Role } from './types';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';

// Audio helper functions from the documentation
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: Role.MODEL,
      content: "Hello! Type a message or press the microphone button to start a conversation.",
    },
  ]);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  const chatRef = useRef<Chat | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Audio state refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Transcription refs
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);
  
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isSending) return;

    const newUserMessage: Message = { role: Role.USER, content };
    setMessages(prev => [...prev, newUserMessage]);
    setIsSending(true);
    setError(null);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        // Use the full message history to initialize the chat, so context is maintained
        if (!chatRef.current) {
            const history: Content[] = messages.map(msg => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            }));
            chatRef.current = ai.chats.create({
                model: 'gemini-2.5-flash',
                history: history
            });
        }
        
        const responseStream = await chatRef.current.sendMessageStream({ message: content });

        let fullResponse = '';
        setMessages(prev => [...prev, { role: Role.MODEL, content: '' }]);

        for await (const chunk of responseStream) {
            fullResponse += chunk.text;
            setMessages(prev => {
                const newMessages = [...prev];
                newMessages[newMessages.length - 1].content = fullResponse;
                return newMessages;
            });
        }
    } catch (e: any) {
        setError(`Error sending message: ${e.message}`);
        setMessages(prev => prev.slice(0, -1)); // Remove the empty model message on error
    } finally {
        setIsSending(false);
    }
  };


  const stopConversation = useCallback(() => {
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current && mediaStreamSourceRef.current && inputAudioContextRef.current) {
        mediaStreamSourceRef.current.disconnect(scriptProcessorRef.current);
        scriptProcessorRef.current.disconnect(inputAudioContextRef.current.destination);
    }
    
    for (const source of audioSourcesRef.current.values()) {
      source.stop();
    }
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
  }, []);
  
  const handleToggleConversation = useCallback(async () => {
    if (isConnected) {
      stopConversation();
      return;
    }

    setIsConnecting(true);
    setError(null);
    chatRef.current = null; // Reset text chat session to pick up new history later

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsConnected(true);

            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentInputTranscriptionRef.current += text;
              setMessages(prev => {
                  const lastMessage = prev[prev.length - 1];
                  if (lastMessage && lastMessage.role === Role.USER) {
                      const newMessages = [...prev];
                      newMessages[newMessages.length - 1] = { ...lastMessage, content: currentInputTranscriptionRef.current };
                      return newMessages;
                  }
                  return [...prev, { role: Role.USER, content: currentInputTranscriptionRef.current }];
              });
            }
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTranscriptionRef.current += text;
              setMessages(prev => {
                  const lastMessage = prev[prev.length - 1];
                  if (lastMessage && lastMessage.role === Role.MODEL) {
                      const newMessages = [...prev];
                      newMessages[newMessages.length - 1] = { ...lastMessage, content: currentOutputTranscriptionRef.current };
                      return newMessages;
                  }
                  return [...prev, { role: Role.MODEL, content: currentOutputTranscriptionRef.current }];
              });
            }

            if (message.serverContent?.turnComplete) {
              currentInputTranscriptionRef.current = '';
              currentOutputTranscriptionRef.current = '';
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const outputCtx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);
              
              source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
                for (const source of audioSourcesRef.current.values()) {
                  source.stop();
                }
                audioSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            setError(`Connection Error: ${e.message || 'An unknown error occurred'}`);
            stopConversation();
          },
          onclose: (e: CloseEvent) => {
            stopConversation();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: 'You are a helpful and friendly chatbot. Provide clear and concise answers.',
        },
      });

      sessionRef.current = await sessionPromise;

    } catch (e: any) {
      setError(`Error: ${e.message}`);
      setIsConnecting(false);
    }
  }, [isConnected, stopConversation]);

  useEffect(() => {
    return () => {
        stopConversation();
    };
  }, [stopConversation]);

  const getStatusText = () => {
    if (isConnecting) return "Connecting voice...";
    if (isConnected) return "Listening... Tap the red button to stop.";
    if (isSending) return "Gemini is thinking...";
    return "Type a message or tap the microphone to talk.";
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
      <header className="p-4 bg-gray-800 shadow-md">
        <h1 className="text-xl font-bold text-center text-gray-200">Gemini Voice & Text Chat</h1>
      </header>
      
      <main ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {messages.map((msg, index) => (
          <ChatMessage key={index} message={msg} />
        ))}
      </main>
      
      <footer className="p-4 bg-gray-900/80 backdrop-blur-sm border-t border-gray-700">
        <div className="max-w-3xl mx-auto">
          {error && <p className="text-red-500 text-sm text-center mb-2">{error}</p>}
          <ChatInput 
            onSendMessage={handleSendMessage}
            onToggleConversation={handleToggleConversation} 
            isConnecting={isConnecting} 
            isConnected={isConnected}
            isSending={isSending}
          />
          <p className="text-gray-400 text-xs text-center mt-3 h-4">{getStatusText()}</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
