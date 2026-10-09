import { useEffect, useId, useState } from "react";
import type { CommunityHighlight } from "../community-highlight";
import { Icon } from "./Icon";

type CommunityHighlightBannerProps = {
  highlight: CommunityHighlight;
  downloading: boolean;
  downloadError: string;
  onDownload: () => void;
  downloadAvailable?: boolean;
  downloadNote?: string;
  downloadMessage?: string;
};

export function CommunityHighlightBanner({ highlight, downloading, downloadError, onDownload, downloadAvailable = false, downloadNote = "Download coming soon", downloadMessage = "" }: CommunityHighlightBannerProps) {
  const [imageError, setImageError] = useState(false);
  const downloadHelpId = useId();
  useEffect(() => setImageError(false), [highlight.imageUrl]);
  const showArtwork = Boolean(highlight.imageUrl) && !imageError;

  return <section className={`community-highlight${showArtwork ? "" : " community-highlight-without-artwork"}`} aria-label="Community highlight">
    <div className="community-highlight-copy">
      <span className="community-highlight-kicker">
        <Icon name="users" />
        COMMUNITY HIGHLIGHT
      </span>
      <h2>{highlight.title}</h2>
      <p className="community-highlight-description">{highlight.description}</p>
      <button className="button button-primary community-highlight-download" type="button" disabled={downloading || !downloadAvailable} aria-busy={downloading} aria-describedby={!downloadAvailable ? downloadHelpId : undefined} onClick={onDownload}>
        {downloading ? "Downloading…" : "Download"}<Icon name="download" />
      </button>
      {!downloadAvailable && <p id={downloadHelpId} className="community-highlight-download-note">{downloadNote}</p>}
      {downloadMessage && <p className="community-highlight-download-note" role="status">{downloadMessage}</p>}
      {downloadError && <p className="community-highlight-error" role="alert">{downloadError}</p>}
    </div>
    {showArtwork && <div className="community-highlight-artwork">
      <img key={highlight.imageUrl} src={highlight.imageUrl} alt={`${highlight.title} artwork`} onError={() => setImageError(true)} />
    </div>}
  </section>;
}
