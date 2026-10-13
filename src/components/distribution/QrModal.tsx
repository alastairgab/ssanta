import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Callout, Modal } from '../ui/ui';
import { Icon } from '../ui/icons';
import { safeFilename } from '../../utils/download';

export function QrModal({ link, name, onClose }: { link: string; name: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(link, { errorCorrectionLevel: 'L', margin: 2, width: 360, color: { dark: '#0b1f18', light: '#ffffff' } })
      .then(setDataUrl)
      .catch(() => setError('This link is too long for a QR code. Share it as text instead.'));
  }, [link]);
  return (
    <Modal open onClose={onClose} title={`QR code for ${name}`} size="sm">
      {error ? (
        <Callout tone="danger">{error}</Callout>
      ) : dataUrl ? (
        <div className="flex flex-col items-center gap-4">
          <img src={dataUrl} alt={`QR code containing ${name}'s personal Secret Santa link`} className="h-72 w-72 rounded-xl ring-1 ring-pine-100" />
          <a className="btn-secondary" href={dataUrl} download={`secret-santa-${safeFilename(name)}.png`}>
            <Icon.Save className="h-4 w-4" /> Download image
          </a>
          <Callout tone="warning">Anyone who scans this code can see who {name} is buying for. Only show or send it to {name}.</Callout>
        </div>
      ) : (
        <p>Generating…</p>
      )}
    </Modal>
  );
}
