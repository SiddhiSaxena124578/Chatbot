
import React from 'react';
import { Message, Role } from '../types';
import UserIcon from './icons/UserIcon';
import BotIcon from './icons/BotIcon';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === Role.USER;

  const wrapperClasses = isUser ? 'justify-end' : 'justify-start';
  const bubbleClasses = isUser
    ? 'bg-blue-600 text-white rounded-br-none'
    : 'bg-gray-700 text-gray-200 rounded-bl-none';
  const icon = isUser ? (
    <UserIcon className="h-6 w-6 text-blue-400" />
  ) : (
    <BotIcon className="h-6 w-6 text-teal-400" />
  );
  const iconOrder = isUser ? 'order-2' : 'order-1';
  const contentOrder = isUser ? 'order-1' : 'order-2';

  return (
    <div className={`flex items-start gap-3 w-full ${wrapperClasses}`}>
      <div className={`flex-shrink-0 self-end ${iconOrder}`}>{icon}</div>
      <div className={`max-w-xs md:max-w-md lg:max-w-2xl ${contentOrder}`}>
        <div className={`px-4 py-3 rounded-2xl ${bubbleClasses}`}>
          <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
