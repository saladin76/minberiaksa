import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: {
    type: 'image' | 'video';
    src: string;
    alt?: string;
  } | null;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, content }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !content) return null;

  const isFacebook = content.src.includes('facebook.com');

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 p-4">
      <div
        ref={modalRef}
        className="relative bg-black rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors backdrop-blur-sm"
        >
          <X className="w-4 h-4" />
        </button>

        {content.type === 'image' ? (
          <img
            src={content.src}
            alt={content.alt}
            className="w-full max-h-[85vh] object-contain"
          />
        ) : (
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={content.src}
              title="Video player"
              frameBorder="0"
              allow={
                isFacebook
                  ? 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share'
                  : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
              }
              allowFullScreen
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal; 