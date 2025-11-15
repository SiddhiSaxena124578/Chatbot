import React from 'react';

const MicrophoneIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
    <path d="M6 15a1.5 1.5 0 00-1.5 1.5v.09a6.002 6.002 0 005.69 5.91A6.002 6.002 0 0018 16.59V16.5A1.5 1.5 0 0016.5 15h-1.5a.75.75 0 01-.75.75v.09a3.001 3.001 0 01-5.19 2.163A3.001 3.001 0 019 16.59v-.09a.75.75 0 01-.75-.75H6z" />
  </svg>
);

export default MicrophoneIcon;
