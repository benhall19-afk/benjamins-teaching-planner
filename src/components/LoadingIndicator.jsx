import React from 'react';

export default function LoadingIndicator({ isLoading, colorClass = 'sage', message = 'Saving...' }) {
  if (!isLoading) return null;

  const bgColor = colorClass === 'sage' ? 'bg-sage-500' : 'bg-amber-500';
  const spinnerColor = colorClass === 'sage' ? 'border-sage-200' : 'border-amber-200';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
      <div className={`${bgColor} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3`}>
        {/* Spinner */}
        <div className={`w-5 h-5 border-2 ${spinnerColor} border-t-white rounded-full animate-spin`} />
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
