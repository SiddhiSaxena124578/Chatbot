import React, { useState } from 'react';
import MicrophoneIcon from './icons/MicrophoneIcon';
import SendIcon from './icons/SendIcon';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onToggleConversation: () => void;
  isConnecting: boolean;
  isConnected: boolean;
  isSending: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onToggleConversation,
  isConnecting,
  isConnected,
  isSending,
}) => {
  const [inputValue, setInputValue] = useState('');
  const isInputDisabled = isConnecting || isConnected;
  const showSendButton = inputValue.trim().length > 0;

  const handleSend = () => {
    if (showSendButton) {
      onSendMessage(inputValue);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const getMicButtonContent = () => {
    if (isConnecting) {
      return <div className="w-8 h-8 border-4 border-t-transparent border-white rounded-full animate-spin"></div>;
    }
    return <MicrophoneIcon className="w-8 h-8" />;
  };

  const micButtonClasses = `p-4 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4
    ${isConnected 
      ? 'bg-red-600 hover:bg-red-500 focus:ring-red-400' 
      : 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-400'
    } 
    text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <div className="flex items-center gap-2 bg-gray-800 rounded-2xl p-2">
      <textarea
        rows={1}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        className="flex-1 bg-transparent text-gray-200 placeholder-gray-500 resize-none focus:outline-none disabled:opacity-50 px-2 py-1 max-h-28"
        disabled={isInputDisabled}
        aria-label="Chat message input"
      />
      {showSendButton ? (
        <button
          onClick={handleSend}
          disabled={isSending || isInputDisabled}
          className="p-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-label="Send message"
        >
          {isSending ? (
            <div className="w-8 h-8 border-4 border-t-transparent border-white rounded-full animate-spin"></div>
          ) : (
            <SendIcon className="w-8 h-8" />
          )}
        </button>
      ) : (
        <button
          onClick={onToggleConversation}
          disabled={isConnecting}
          className={micButtonClasses}
          aria-label={isConnected ? "Stop conversation" : "Start conversation"}
        >
          {getMicButtonContent()}
        </button>
      )}
    </div>
  );
};

export default ChatInput;