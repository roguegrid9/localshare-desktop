import { useState } from 'react';
import { open } from '@tauri-apps/plugin-shell';

interface TOSAcceptanceProps {
  onAccept: () => void;
  onDecline: () => void;
  disabled?: boolean;
}

const classes = {
  root: 'space-y-6',
  header: 'text-center space-y-2',
  title: 'text-2xl font-semibold',
  subtitle: 'text-sm text-gray-400',
  checkboxContainer: 'flex items-start gap-3 p-4 bg-[#111319] border border-white/10 rounded-xl',
  checkbox: 'mt-0.5 w-5 h-5 rounded border-white/20 bg-[#0B0D10] checked:bg-orange-500 cursor-pointer',
  checkboxLabel: 'text-sm text-gray-300 flex-1',
  linksContainer: 'grid grid-cols-2 gap-3',
  link: 'text-xs px-3 py-2 rounded-lg bg-[#111319] border border-white/10 text-gray-300 hover:bg-white/5 hover:border-white/20 transition-colors text-center cursor-pointer',
  buttonContainer: 'flex gap-3',
  declineBtn: 'flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl disabled:opacity-50 font-semibold',
  acceptBtn: 'flex-1 px-4 py-2 bg-gradient-to-r from-[#FF8A00] to-[#FF3D00] text-white rounded-xl disabled:opacity-50 font-semibold',
  warning: 'p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm',
};

export default function TOSAcceptance({ onAccept, onDecline, disabled }: TOSAcceptanceProps) {
  const [hasAccepted, setHasAccepted] = useState(false);

  const handleOpenLink = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open link:', error);
    }
  };

  const handleAccept = () => {
    if (hasAccepted && !disabled) {
      onAccept();
    }
  };

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <h2 className={classes.title}>Terms & Agreements</h2>
        <p className={classes.subtitle}>
          Please review and accept our terms before continuing
        </p>
      </div>

      <div className={classes.warning}>
        <p className="font-semibold mb-1">⚠️ Important: This is Beta Software</p>
        <p className="text-xs">
          RogueGrid9 is experimental and may contain bugs. Data loss is possible.
          Do not use for critical applications.
        </p>
      </div>

      <div className={classes.linksContainer}>
        <button
          onClick={() => handleOpenLink('https://roguegrid9.com/terms')}
          className={classes.link}
        >
          📄 Terms of Service
        </button>
        <button
          onClick={() => handleOpenLink('https://roguegrid9.com/privacy')}
          className={classes.link}
        >
          🔒 Privacy Policy
        </button>
        <button
          onClick={() => handleOpenLink('https://roguegrid9.com/acceptable-use')}
          className={classes.link}
        >
          ⚖️ Acceptable Use
        </button>
        <button
          onClick={() => handleOpenLink('https://roguegrid9.com/beta-agreement')}
          className={classes.link}
        >
          🧪 Beta Agreement
        </button>
      </div>

      <div className={classes.checkboxContainer}>
        <input
          type="checkbox"
          id="tos-accept"
          checked={hasAccepted}
          onChange={(e) => setHasAccepted(e.target.checked)}
          disabled={disabled}
          className={classes.checkbox}
        />
        <label htmlFor="tos-accept" className={classes.checkboxLabel}>
          I have read and agree to the Terms of Service, Privacy Policy, Acceptable Use Policy,
          and Beta Testing Agreement. I understand this is experimental beta software and
          accept the risks of data loss and service interruptions.
        </label>
      </div>

      <div className={classes.buttonContainer}>
        <button
          onClick={onDecline}
          disabled={disabled}
          className={classes.declineBtn}
        >
          Decline
        </button>
        <button
          onClick={handleAccept}
          disabled={disabled || !hasAccepted}
          className={classes.acceptBtn}
        >
          {disabled ? 'Processing...' : 'Accept & Continue'}
        </button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        By accepting, you acknowledge that you have read and understood all policies listed above
      </p>
    </div>
  );
}
