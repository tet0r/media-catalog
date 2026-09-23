import { useState } from 'react';

// Unlike TMDB/Audible/Open Library, MusicBrainz's search results don't
// confirm the Cover Art Archive actually has an image for a given
// release-group — the URL is a predictable guess that may 404. This swaps
// to the usual no-poster placeholder if the image fails to load, instead
// of leaving a broken-image icon in candidate lists (Add Album, Needs
// Review) where the URL hasn't been verified yet. Not needed once an album
// is actually added — by then cover_url points at our own cached file,
// which only exists if the fetch already succeeded.
export default function CoverImage({ url, alt }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <div className="no-poster">{alt}</div>;
  }
  return <img src={url} alt={alt} onError={() => setFailed(true)} />;
}
