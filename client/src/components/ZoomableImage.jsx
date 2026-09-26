import { useState } from 'react';
import { createPortal } from 'react-dom';

// Click a thumbnail to see it larger in an overlay; click anywhere else to
// dismiss it. Used on Needs Review candidate thumbnails across every media
// type, where the small poster/cover often isn't enough to tell two
// similar-looking candidates apart.
//
// The overlay is rendered via a portal straight to document.body rather
// than in place — plenty of ancestors (.candidate, .poster, .cast-member,
// ...) have their own "img { width: ...; height: ... }" rules for the
// small thumbnail, which would otherwise clamp the enlarged copy down to
// thumbnail size too, since it'd still be a DOM descendant of the same
// container.
export default function ZoomableImage({ src, alt, className, onError }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`clickable${className ? ` ${className}` : ''}`}
        onError={onError}
        onClick={() => setZoomed(true)}
        title="Click to enlarge"
      />
      {zoomed &&
        createPortal(
          <div className="image-zoom-overlay" onClick={() => setZoomed(false)}>
            <img src={src} alt={alt} className="image-zoom-large" onClick={(e) => e.stopPropagation()} />
          </div>,
          document.body
        )}
    </>
  );
}
